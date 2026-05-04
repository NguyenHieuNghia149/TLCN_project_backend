import crypto from 'crypto';

import { createEMailService } from './email.service';
import { AppException } from '../exceptions/base.exception';
import {
  AuthorizationException,
  RateLimitExceededException,
  UserNotFoundException,
  ValidationException,
} from '../exceptions/auth.exceptions';
import {
  ExamEndedException,
  ExamNotFoundException,
  ExamParticipationNotFoundException,
  ExamNotStartedException,
  InvalidPasswordException,
} from '../exceptions/exam.exceptions';
import { ExamAuditLogRepository } from '../repositories/examAuditLog.repository';
import { ExamEntrySessionRepository } from '../repositories/examEntrySession.repository';
import { ExamInviteRepository } from '../repositories/examInvite.repository';
import { ExamParticipantRepository } from '../repositories/examParticipant.repository';
import { ExamParticipationRepository } from '../repositories/examParticipation.repository';
import { createExamRepository, ExamRepository } from '../repositories/exam.repository';
import { ExamToProblemsRepository } from '../repositories/examToProblems.repository';
import { TokenRepository } from '../repositories/token.repository';
import { UserRepository } from '../repositories/user.repository';
import { EExamParticipationStatus } from '@backend/shared/types';
import {
  JWTUtils,
  PasswordUtils,
  RateLimitUtils,
  SanitizationUtils,
  TokenUtils,
} from '@backend/shared/utils';

type ExamAccessServiceDependencies = {
  examRepository: ExamRepository | any;
  examToProblemsRepository: ExamToProblemsRepository | any;
  examParticipationRepository: ExamParticipationRepository | any;
  examParticipantRepository: ExamParticipantRepository | any;
  examInviteRepository: ExamInviteRepository | any;
  examEntrySessionRepository: ExamEntrySessionRepository | any;
  examAuditLogRepository: ExamAuditLogRepository | any;
  userRepository: UserRepository | any;
  tokenRepository: TokenRepository | any;
  emailService: any;
};

type RegisterForExamInput = {
  email: string;
  fullName: string;
  userId?: string;
};

type VerifyOtpInput = {
  email: string;
  otp: string;
};

type SyncParticipationInput = {
  participationId: string;
  answers: Record<string, unknown>;
};

const OTP_RESEND_COOLDOWN_MS = 60_000;
const REGISTRATION_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const OTP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWNS = new Map<string, number>();

export class ExamAccessService {
  constructor(private readonly deps: ExamAccessServiceDependencies) {}

  async listAdminExams(input: {
    limit?: number;
    offset?: number;
    createdBy?: string;
    search?: string;
  }) {
    const { items, total } = await this.deps.examRepository.getExamsPaginated(
      input.limit ?? 50,
      input.offset ?? 0,
      {
        createdBy: input.createdBy,
        search: input.search,
      },
    );

    return {
      data: await Promise.all(items.map((item: any) => this.mapAdminExam(item))),
      total,
    };
  }

  async getAdminExamById(examId: string) {
    const exam = await this.deps.examRepository.findById(examId);
    if (!exam) {
      throw new ExamNotFoundException();
    }

    return this.mapAdminExam(exam);
  }

  async createAdminExam(
    createdBy: string,
    input: {
      title: string;
      slug: string;
      duration: number;
      startDate: string;
      endDate: string;
      isVisible?: boolean;
      maxAttempts?: number;
      accessMode: string;
      selfRegistrationApprovalMode?: string | null;
      selfRegistrationPasswordRequired?: boolean;
      allowExternalCandidates?: boolean;
      registrationOpenAt?: string | null;
      registrationCloseAt?: string | null;
      examPassword?: string | null;
      challenges: Array<{ type: 'existing' | 'new'; challengeId?: string; challenge?: any; orderIndex?: number }>;
    },
  ) {
    this.assertExamConfiguration(input);
    await this.assertUniqueSlug(input.slug);

    const createdExamId = await this.deps.examRepository.createExamWithChallenges(
      {
        title: input.title,
        slug: input.slug,
        duration: input.duration,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        isVisible: input.isVisible ?? false,
        maxAttempts: input.maxAttempts ?? 1,
        createdBy,
        status: input.isVisible ? 'published' : 'draft',
        accessMode: input.accessMode,
        selfRegistrationApprovalMode: input.selfRegistrationApprovalMode ?? null,
        selfRegistrationPasswordRequired: input.selfRegistrationPasswordRequired ?? false,
        allowExternalCandidates: input.allowExternalCandidates ?? false,
        registrationOpenAt: input.registrationOpenAt ? new Date(input.registrationOpenAt) : null,
        registrationCloseAt: input.registrationCloseAt
          ? new Date(input.registrationCloseAt)
          : null,
        registrationPassword: input.examPassword || null,
      },
      input.challenges,
    );

    await this.writeAuditLog({
      examId: createdExamId,
      actorType: 'user',
      actorId: createdBy,
      action: 'create_exam',
      targetType: 'exam',
      targetId: createdExamId,
      metadata: { accessMode: input.accessMode },
    });

    return this.getAdminExamById(createdExamId);
  }

  async updateAdminExam(
    examId: string,
    actorId: string,
    input: Partial<{
      title: string;
      slug: string;
      duration: number;
      startDate: string;
      endDate: string;
      isVisible: boolean;
      maxAttempts: number;
      accessMode: string;
      selfRegistrationApprovalMode: string | null;
      selfRegistrationPasswordRequired: boolean;
      allowExternalCandidates: boolean;
      registrationOpenAt: string | null;
      registrationCloseAt: string | null;
      examPassword: string | null;
      challenges: Array<{ challengeId: string; orderIndex: number }>;
    }>,
  ) {
    const currentExam = await this.deps.examRepository.findById(examId);
    if (!currentExam) {
      throw new ExamNotFoundException();
    }

    const now = new Date();
    const nextEndDate =
      input.endDate === undefined ? new Date(currentExam.endDate) : new Date(input.endDate);

    if (input.isVisible === true && currentExam.status !== 'published') {
      throw new AppException('Only published exams can be visible', 409, 'EXAM_STATUS_TRANSITION_INVALID', {
        action: 'set_visible',
        currentStatus: currentExam.status,
        requiredStatus: 'published',
      });
    }

    if (input.isVisible === true && now > nextEndDate) {
      throw new AppException(
        'Cannot make an exam visible after it has ended',
        422,
        'EXAM_VISIBILITY_EXPIRED',
        {
          examId,
          endDate: this.asIsoString(nextEndDate),
        },
      );
    }

    const resolvedAccessMode = input.accessMode ?? currentExam.accessMode;
    const resolvedSelfRegistrationApprovalMode =
      input.selfRegistrationApprovalMode === undefined
        ? currentExam.selfRegistrationApprovalMode
        : input.selfRegistrationApprovalMode;
    const allowLegacySelfRegistrationApprovalMode =
      input.accessMode === undefined &&
      input.selfRegistrationApprovalMode === undefined &&
      resolvedAccessMode !== 'invite_only' &&
      resolvedSelfRegistrationApprovalMode == null;

    this.assertExamConfiguration({
      title: input.title ?? currentExam.title,
      slug: input.slug ?? currentExam.slug,
      duration: input.duration ?? currentExam.duration,
      startDate: input.startDate ?? this.asIsoString(currentExam.startDate),
      endDate: input.endDate ?? this.asIsoString(currentExam.endDate),
      accessMode: resolvedAccessMode,
      selfRegistrationApprovalMode:
        allowLegacySelfRegistrationApprovalMode
          ? 'auto'
          : resolvedSelfRegistrationApprovalMode,
      selfRegistrationPasswordRequired:
        input.selfRegistrationPasswordRequired ?? currentExam.selfRegistrationPasswordRequired,
      allowExternalCandidates:
        input.allowExternalCandidates ?? currentExam.allowExternalCandidates,
      registrationOpenAt:
        input.registrationOpenAt === undefined
          ? currentExam.registrationOpenAt
            ? this.asIsoString(currentExam.registrationOpenAt)
            : null
          : input.registrationOpenAt,
      registrationCloseAt:
        input.registrationCloseAt === undefined
          ? currentExam.registrationCloseAt
            ? this.asIsoString(currentExam.registrationCloseAt)
            : null
          : input.registrationCloseAt,
      registrationPassword:
        input.examPassword === undefined ? currentExam.registrationPassword : input.examPassword,
      allowMissingRegistrationWindow: allowLegacySelfRegistrationApprovalMode,
    });

    if (input.slug && input.slug !== currentExam.slug) {
      await this.assertUniqueSlug(input.slug);
    }

    const patch: Record<string, unknown> = {
      title: input.title,
      slug: input.slug,
      duration: input.duration,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      isVisible: input.isVisible,
      maxAttempts: input.maxAttempts,
      accessMode: input.accessMode,
      selfRegistrationApprovalMode:
        input.selfRegistrationApprovalMode === undefined
          ? undefined
          : input.selfRegistrationApprovalMode,
      selfRegistrationPasswordRequired: input.selfRegistrationPasswordRequired,
      allowExternalCandidates: input.allowExternalCandidates,
      registrationOpenAt:
        input.registrationOpenAt === undefined
          ? undefined
          : input.registrationOpenAt
            ? new Date(input.registrationOpenAt)
            : null,
      registrationCloseAt:
        input.registrationCloseAt === undefined
          ? undefined
          : input.registrationCloseAt
            ? new Date(input.registrationCloseAt)
            : null,
    };

    if (input.examPassword !== undefined) {
      patch.registrationPassword = input.examPassword || null;
    }

    if (input.challenges) {
      await this.deps.examRepository.updateExamWithChallenges(examId, patch, input.challenges);
    } else {
      await this.deps.examRepository.update(examId, patch);
    }

    if (input.startDate || input.endDate) {
      await this.writeAuditLog({
        examId,
        actorType: 'user',
        actorId,
        action: 'reschedule_exam',
        targetType: 'exam',
        targetId: examId,
        metadata: {
          previousStartDate: currentExam.startDate,
          previousEndDate: currentExam.endDate,
          nextStartDate: input.startDate ?? null,
          nextEndDate: input.endDate ?? null,
        },
      });

      if (currentExam.status === 'published') {
        await this.notifyParticipantsAboutScheduleChange(examId, {
          ...currentExam,
          title: input.title ?? currentExam.title,
          slug: input.slug ?? currentExam.slug,
          startDate: input.startDate ? new Date(input.startDate) : currentExam.startDate,
          endDate: input.endDate ? new Date(input.endDate) : currentExam.endDate,
        });
      }
    }

    return this.getAdminExamById(examId);
  }

  async publishExam(examId: string, actorId: string) {
    const exam = await this.deps.examRepository.findById(examId);
    if (!exam) {
      throw new ExamNotFoundException();
    }

    if (exam.status !== 'draft') {
      throw new AppException(
        `Exam cannot be published from status "${exam.status}"`,
        409,
        'EXAM_STATUS_TRANSITION_INVALID',
        {
          action: 'publish',
          currentStatus: exam.status,
          allowedFrom: ['draft'],
          targetStatus: 'published',
        },
      );
    }

    const now = new Date();
    if (now > new Date(exam.endDate)) {
      throw new AppException(
        'Cannot publish an exam that has already ended',
        422,
        'EXAM_VISIBILITY_EXPIRED',
        {
          examId,
          endDate: this.asIsoString(exam.endDate),
        },
      );
    }

    const updated = await this.deps.examRepository.publishIfDraft(examId);

    if (!updated) {
      const latestExam = await this.deps.examRepository.findById(examId);
      if (!latestExam) {
        throw new ExamNotFoundException();
      }

      if (latestExam.status !== 'draft') {
        throw new AppException(
          `Exam cannot be published from status "${latestExam.status}"`,
          409,
          'EXAM_STATUS_TRANSITION_INVALID',
          {
            action: 'publish',
            currentStatus: latestExam.status,
            allowedFrom: ['draft'],
            targetStatus: 'published',
          },
        );
      }

      if (now > new Date(latestExam.endDate)) {
        throw new AppException(
          'Cannot publish an exam that has already ended',
          422,
          'EXAM_VISIBILITY_EXPIRED',
          {
            examId,
            endDate: this.asIsoString(latestExam.endDate),
          },
        );
      }

      throw new AppException('Failed to publish exam due to concurrent updates', 409, 'EXAM_CONFLICT', {
        examId,
      });
    }

    await this.writeAuditLog({
      examId,
      actorType: 'user',
      actorId,
      action: 'publish_exam',
      targetType: 'exam',
      targetId: examId,
      metadata: {
        prevStatus: exam.status,
        newStatus: 'published',
      },
    });

    return this.mapAdminExam(updated);
  }

  async cancelExam(examId: string, actorId: string) {
    const exam = await this.deps.examRepository.findById(examId);
    if (!exam) {
      throw new ExamNotFoundException();
    }

    if (exam.status !== 'published') {
      throw new AppException(
        `Exam cannot be cancelled from status "${exam.status}"`,
        409,
        'EXAM_STATUS_TRANSITION_INVALID',
        {
          action: 'cancel',
          currentStatus: exam.status,
          allowedFrom: ['published'],
          targetStatus: 'cancelled',
        },
      );
    }

    const participantCount = await this.deps.examRepository.countActiveParticipants(examId);
    if (participantCount > 0) {
      throw new AppException(
        'Cannot cancel an exam that already has participants',
        422,
        'EXAM_CANCEL_HAS_PARTICIPANTS',
        {
          examId,
          participantCount,
        },
      );
    }

    const updated = await this.deps.examRepository.cancelIfPublishedWithoutParticipants(examId);
    if (!updated) {
      const latestExam = await this.deps.examRepository.findById(examId);
      if (!latestExam) {
        throw new ExamNotFoundException();
      }

      const latestParticipantCount =
        await this.deps.examRepository.countActiveParticipants(examId);

      if (latestParticipantCount > 0) {
        throw new AppException(
          'Cannot cancel an exam that already has participants',
          422,
          'EXAM_CANCEL_HAS_PARTICIPANTS',
          {
            examId,
            participantCount: latestParticipantCount,
          },
        );
      }

      throw new AppException(
        `Exam cannot be cancelled from status "${latestExam.status}"`,
        409,
        'EXAM_STATUS_TRANSITION_INVALID',
        {
          action: 'cancel',
          currentStatus: latestExam.status,
          allowedFrom: ['published'],
          targetStatus: 'cancelled',
        },
      );
    }

    await this.writeAuditLog({
      examId,
      actorType: 'user',
      actorId,
      action: 'cancel_exam',
      targetType: 'exam',
      targetId: examId,
      metadata: {
        prevStatus: exam.status,
        newStatus: 'cancelled',
        participantCount,
        endDate: this.asIsoString(exam.endDate),
        reason: null,
      },
    });

    return this.mapAdminExam(updated);
  }

  async archiveExam(examId: string, actorId: string) {
    const exam = await this.deps.examRepository.findById(examId);
    if (!exam) {
      throw new ExamNotFoundException();
    }

    const now = new Date();
    let updated = null;

    if (exam.status === 'published') {
      if (now <= new Date(exam.endDate)) {
        throw new AppException(
          'Published exams can be archived only after the end time',
          422,
          'EXAM_ARCHIVE_NOT_ENDED',
          {
            examId,
            endDate: this.asIsoString(exam.endDate),
          },
        );
      }
      updated = await this.deps.examRepository.archivePublishedIfEnded(examId, now);
    } else if (exam.status === 'cancelled') {
      updated = await this.deps.examRepository.archiveCancelled(examId);
    } else {
      throw new AppException(
        `Exam cannot be archived from status "${exam.status}"`,
        409,
        'EXAM_STATUS_TRANSITION_INVALID',
        {
          action: 'archive',
          currentStatus: exam.status,
          allowedFrom: ['published', 'cancelled'],
          targetStatus: 'archived',
        },
      );
    }

    if (!updated) {
      const latestExam = await this.deps.examRepository.findById(examId);
      if (!latestExam) {
        throw new ExamNotFoundException();
      }

      if (latestExam.status === 'published' && now <= new Date(latestExam.endDate)) {
        throw new AppException(
          'Published exams can be archived only after the end time',
          422,
          'EXAM_ARCHIVE_NOT_ENDED',
          {
            examId,
            endDate: this.asIsoString(latestExam.endDate),
          },
        );
      }

      throw new AppException(
        `Exam cannot be archived from status "${latestExam.status}"`,
        409,
        'EXAM_STATUS_TRANSITION_INVALID',
        {
          action: 'archive',
          currentStatus: latestExam.status,
          allowedFrom: ['published', 'cancelled'],
          targetStatus: 'archived',
        },
      );
    }

    const participantCount = await this.deps.examRepository.countActiveParticipants(examId);
    await this.writeAuditLog({
      examId,
      actorType: 'user',
      actorId,
      action: 'archive_exam',
      targetType: 'exam',
      targetId: examId,
      metadata: {
        prevStatus: exam.status,
        newStatus: 'archived',
        participantCount,
        endDate: this.asIsoString(exam.endDate),
        reason: null,
      },
    });

    return this.mapAdminExam(updated);
  }

  async listAdminExamParticipants(examId: string) {
    const exam = await this.deps.examRepository.findById(examId);
    if (!exam) {
      throw new ExamNotFoundException();
    }

    const participants = await this.deps.examParticipantRepository.findByExamId(examId);
    return Promise.all(
      participants.map((participant: any) => this.mapParticipantSummary(exam, participant)),
    );
  }

  async addAdminExamParticipants(
    examId: string,
    actorId: string,
    input: {
      participants: Array<{
        email?: string;
        fullName?: string;
        userId?: string;
      }>;
    },
  ) {
    const exam = await this.deps.examRepository.findById(examId);
    if (!exam) {
      throw new ExamNotFoundException();
    }

    const results = [];
    for (const candidate of input.participants) {
      if (!candidate.userId && !exam.allowExternalCandidates) {
        throw new ValidationException('External candidates are not allowed for this exam');
      }

      const normalizedEmail = candidate.userId
        ? SanitizationUtils.sanitizeEmail(
            (await this.requireUserById(candidate.userId)).email,
          )
        : SanitizationUtils.sanitizeEmail(candidate.email || '');
      const boundUser = candidate.userId
        ? await this.requireUserById(candidate.userId)
        : null;
      const fullName =
        candidate.fullName?.trim() ||
        [boundUser?.firstName, boundUser?.lastName].filter(Boolean).join(' ').trim() ||
        normalizedEmail;

      const existingParticipant =
        await this.deps.examParticipantRepository.findByExamAndIdentity(examId, {
          normalizedEmail,
          userId: candidate.userId ?? null,
        });

      if (existingParticipant) {
        results.push(await this.mapParticipantSummary(exam, existingParticipant));
        continue;
      }

      const createdParticipant = await this.deps.examParticipantRepository.create({
        examId,
        userId: candidate.userId ?? null,
        normalizedEmail,
        fullName,
        source: 'manual_add',
        approvalStatus: 'approved',
        accessStatus: 'invited',
      });

      await this.writeAuditLog({
        examId,
        actorType: 'user',
        actorId,
        action: 'add_participant',
        targetType: 'exam_participant',
        targetId: createdParticipant.id,
        metadata: { source: 'manual_add' },
      });

      results.push(await this.mapParticipantSummary(exam, createdParticipant));
    }

    return results;
  }

  async approveParticipant(examId: string, participantId: string, actorId: string) {
    const exam = await this.deps.examRepository.findById(examId);
    const participant = await this.requireParticipant(examId, participantId);
    if (!exam) {
      throw new ExamNotFoundException();
    }

    const updated = await this.deps.examParticipantRepository.updateApproval(participant.id, {
      approvalStatus: 'approved',
      accessStatus: this.participantUsesSelfRegistrationPath(participant) ? 'eligible' : 'invited',
      approvedBy: actorId,
    });

    await this.writeAuditLog({
      examId,
      actorType: 'user',
      actorId,
      action: 'approve_participant',
      targetType: 'exam_participant',
      targetId: participant.id,
      metadata: null,
    });

    if (updated) {
      await this.sendParticipantDecisionEmail(
        exam,
        updated,
        'approved',
        this.getRegistrationPasswordForEmail(exam),
      );
      return this.mapParticipantSummary(exam, updated);
    }

    return this.mapParticipantSummary(exam, participant);
  }

  async rejectParticipant(examId: string, participantId: string, actorId: string) {
    const exam = await this.deps.examRepository.findById(examId);
    const participant = await this.requireParticipant(examId, participantId);
    if (!exam) {
      throw new ExamNotFoundException();
    }

    const updated = await this.deps.examParticipantRepository.updateApproval(participant.id, {
      approvalStatus: 'rejected',
      accessStatus: null,
      approvedBy: actorId,
    });

    await this.writeAuditLog({
      examId,
      actorType: 'user',
      actorId,
      action: 'reject_participant',
      targetType: 'exam_participant',
      targetId: participant.id,
      metadata: null,
    });

    if (updated) {
      await this.sendParticipantDecisionEmail(exam, updated, 'rejected');
      return this.mapParticipantSummary(exam, updated);
    }

    return this.mapParticipantSummary(exam, participant);
  }

  async revokeParticipant(examId: string, participantId: string, actorId: string) {
    const exam = await this.deps.examRepository.findById(examId);
    const participant = await this.requireParticipant(examId, participantId);
    if (!exam) {
      throw new ExamNotFoundException();
    }

    const now = new Date();
    await this.deps.examInviteRepository.revokeActiveByParticipant(participant.id, now);
    const updated = await this.deps.examParticipantRepository.updateAccessStatus(
      participant.id,
      'revoked',
    );

    await this.writeAuditLog({
      examId,
      actorType: 'user',
      actorId,
      action: 'revoke_participant',
      targetType: 'exam_participant',
      targetId: participant.id,
      metadata: null,
    });

    return this.mapParticipantSummary(exam, updated ?? participant);
  }

  async resendInvite(examId: string, participantId: string, actorId: string) {
    const exam = await this.deps.examRepository.findById(examId);
    const participant = await this.requireParticipant(examId, participantId);
    if (!exam) {
      throw new ExamNotFoundException();
    }

    if (exam.status !== 'published') {
      throw new AuthorizationException('Cannot send invites before the exam is published');
    }

    if (participant.approvalStatus !== 'approved') {
      throw new AuthorizationException('Participant has not been approved yet');
    }

    if (participant.accessStatus === 'revoked') {
      throw new AuthorizationException('Participant access has been revoked');
    }

    if (!this.participantRequiresInviteFlow(exam, participant)) {
      throw new AuthorizationException('Invite links are not used for this participant');
    }

    const now = new Date();
    const previousInvite = this.deps.examInviteRepository.findLatestActiveByParticipant
      ? await this.deps.examInviteRepository.findLatestActiveByParticipant(participant.id)
      : null;
    await this.deps.examInviteRepository.revokeActiveByParticipant(participant.id, now);

    const inviteToken = TokenUtils.generateSecureToken(32);
    const invite = await this.deps.examInviteRepository.create({
      examId,
      participantId,
      tokenHash: this.hashOpaqueToken(inviteToken),
      invitedBy: actorId,
      sentAt: now,
      expiresAt: exam.endDate instanceof Date ? exam.endDate : new Date(exam.endDate),
    });

    await this.deps.examParticipantRepository.markInviteSent(participant.id, now);
    await this.deps.examParticipantRepository.updateAccessStatus(participant.id, 'invited');
    await this.sendParticipantInviteEmail(exam, participant, inviteToken);
    await this.writeAuditLog({
      examId,
      actorType: 'user',
      actorId,
      action: previousInvite ? 'resend_invite' : 'send_invite',
      targetType: 'exam_invite',
      targetId: invite.id,
      metadata: { participantId: participant.id },
    });

    return {
      inviteId: invite.id,
      participantId: participant.id,
      sentAt: this.asIsoString(invite.sentAt ?? now),
      expiresAt: this.asIsoString(invite.expiresAt),
    };
  }

  async bindParticipantAccount(
    examId: string,
    participantId: string,
    actorId: string,
    userId: string,
  ) {
    const exam = await this.deps.examRepository.findById(examId);
    const participant = await this.requireParticipant(examId, participantId);
    const user = await this.requireUserById(userId);
    if (!exam) {
      throw new ExamNotFoundException();
    }

    if (SanitizationUtils.sanitizeEmail(user.email) !== participant.normalizedEmail) {
      throw new AuthorizationException('User email does not match participant email');
    }

    const updated = await this.deps.examParticipantRepository.bindUser(participant.id, user.id);

    await this.writeAuditLog({
      examId,
      actorType: 'user',
      actorId,
      action: 'bind_account',
      targetType: 'exam_participant',
      targetId: participant.id,
      metadata: { userId: user.id },
    });

    return this.mapParticipantSummary(exam, updated ?? { ...participant, userId: user.id });
  }

  async mergeParticipants(
    examId: string,
    actorId: string,
    input: { sourceParticipantId: string; targetParticipantId: string },
  ) {
    if (input.sourceParticipantId === input.targetParticipantId) {
      throw new ValidationException('Source and target participants must be different');
    }

    const exam = await this.deps.examRepository.findById(examId);
    const sourceParticipant = await this.requireParticipant(examId, input.sourceParticipantId);
    const targetParticipant = await this.requireParticipant(examId, input.targetParticipantId);
    if (!exam) {
      throw new ExamNotFoundException();
    }

    if (
      sourceParticipant.userId &&
      targetParticipant.userId &&
      sourceParticipant.userId !== targetParticipant.userId
    ) {
      throw new ValidationException('Cannot merge participants bound to different users');
    }

    await this.deps.examInviteRepository.reassignParticipant(
      sourceParticipant.id,
      targetParticipant.id,
    );
    await this.deps.examEntrySessionRepository.reassignParticipant(
      sourceParticipant.id,
      targetParticipant.id,
    );
    await this.deps.examParticipationRepository.reassignParticipant(
      sourceParticipant.id,
      targetParticipant.id,
    );

    const mergedApprovalStatus = this.resolveMergedApprovalStatus(
      sourceParticipant.approvalStatus,
      targetParticipant.approvalStatus,
    );
    const mergedAccessStatus = this.resolveMergedAccessStatus(
      sourceParticipant.accessStatus,
      targetParticipant.accessStatus,
    );

    const updatedTarget = await this.deps.examParticipantRepository.update(targetParticipant.id, {
      userId: targetParticipant.userId ?? sourceParticipant.userId ?? null,
      fullName: targetParticipant.fullName || sourceParticipant.fullName,
      approvalStatus: mergedApprovalStatus,
      accessStatus: mergedAccessStatus,
      approvedBy: targetParticipant.approvedBy ?? sourceParticipant.approvedBy ?? null,
      inviteSentAt: targetParticipant.inviteSentAt ?? sourceParticipant.inviteSentAt ?? null,
      joinedAt: targetParticipant.joinedAt ?? sourceParticipant.joinedAt ?? null,
    });

    await this.deps.examParticipantRepository.markMerged(
      sourceParticipant.id,
      targetParticipant.id,
    );

    await this.writeAuditLog({
      examId,
      actorType: 'user',
      actorId,
      action: 'merge_participants',
      targetType: 'exam_participant',
      targetId: targetParticipant.id,
      metadata: { sourceParticipantId: sourceParticipant.id },
    });

    return this.mapParticipantSummary(exam, updatedTarget ?? targetParticipant);
  }

  async getPublicExamBySlug(slug: string) {
    const exam = await this.requireExamBySlug(slug);
    this.assertExamPublishedForAccess(exam, 'public_landing');
    const challengeLinks = await this.deps.examToProblemsRepository.findByExamId(exam.id);
    const now = new Date();

    return {
      id: exam.id,
      slug: exam.slug,
      title: exam.title,
      status: exam.status,
      accessMode: exam.accessMode,
      startDate: this.asIsoString(exam.startDate),
      endDate: this.asIsoString(exam.endDate),
      registrationOpenAt: exam.registrationOpenAt ? this.asIsoString(exam.registrationOpenAt) : null,
      registrationCloseAt: exam.registrationCloseAt
        ? this.asIsoString(exam.registrationCloseAt)
        : null,
      duration: exam.duration,
      maxAttempts: exam.maxAttempts,
      challengeCount: challengeLinks.length,
      allowExternalCandidates: exam.allowExternalCandidates,
      selfRegistrationApprovalMode: exam.selfRegistrationApprovalMode ?? null,
      selfRegistrationPasswordRequired: exam.selfRegistrationPasswordRequired,
      isRegistrationOpen: this.isRegistrationWindowOpen(exam, now),
      canUseInviteLink: exam.accessMode !== 'open_registration',
    };
  }

  async registerForExam(slug: string, input: RegisterForExamInput) {
    const exam = await this.requireExamBySlug(slug);
    this.assertExamPublishedForAccess(exam, 'register');
    if (exam.accessMode === 'invite_only') {
      throw new AuthorizationException('Registration not available for this exam');
    }

    const authenticatedUser = input.userId ? await this.requireUserById(input.userId) : null;
    const normalizedEmail = authenticatedUser
      ? SanitizationUtils.sanitizeEmail(authenticatedUser.email)
      : SanitizationUtils.sanitizeEmail(input.email);
    const fullName =
      input.fullName?.trim() ||
      [authenticatedUser?.firstName, authenticatedUser?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      normalizedEmail;

    if (!input.userId && !exam.allowExternalCandidates) {
      throw new AuthorizationException('External candidates are not allowed for this exam');
    }

    if (!input.userId) {
      const existingRealUser = await this.findExistingRealUserByEmail(normalizedEmail);
      if (existingRealUser) {
        throw new AuthorizationException(
          'Please sign in with your existing account to register for this exam',
        );
      }
    }

    this.enforceRegistrationRateLimit(exam.id, normalizedEmail);
    await this.assertRegistrationWindow(exam);

    const existingParticipant = await this.deps.examParticipantRepository.findByExamAndIdentity(
      exam.id,
      {
        normalizedEmail,
        userId: input.userId ?? null,
      },
    );

    if (existingParticipant) {
      return {
        ...(await this.buildAccessState(exam, existingParticipant, null, null, input.userId ?? null)),
        created: false,
      };
    }

    const approvalStatus =
      exam.selfRegistrationApprovalMode === 'manual' ? 'pending' : 'approved';
    const accessStatus = approvalStatus === 'approved' ? 'eligible' : null;
    let createdParticipant = await this.deps.examParticipantRepository.create({
      examId: exam.id,
      userId: input.userId ?? null,
      normalizedEmail,
      fullName,
      source: 'self_registration',
      approvalStatus,
      accessStatus,
    });

    await this.writeAuditLog({
      examId: exam.id,
      actorType: input.userId ? 'user' : 'system',
      actorId: input.userId ?? null,
      action: 'add_participant',
      targetType: 'exam_participant',
      targetId: createdParticipant.id,
      metadata: { source: 'self_registration' },
    });

    await this.sendRegistrationReceivedEmail(
      exam,
      createdParticipant,
      approvalStatus === 'approved' ? this.getRegistrationPasswordForEmail(exam) : null,
    );

    let entrySession = null;
    if (input.userId && approvalStatus === 'approved') {
      createdParticipant =
        (await this.deps.examParticipantRepository.bindUser(createdParticipant.id, input.userId)) ??
        createdParticipant;
      entrySession = await this.ensureVerifiedEntrySession(
        exam,
        createdParticipant,
        'account_login',
      );
    }

    return {
      ...(await this.buildAccessState(
        exam,
        createdParticipant,
        entrySession,
        null,
        input.userId ?? null,
      )),
      created: true,
    };
  }

  async resolveInvite(
    slug: string,
    input: { inviteToken: string; userId?: string | null },
  ): Promise<Record<string, unknown>> {
    const exam = await this.requireExamBySlug(slug);
    this.assertExamPublishedForAccess(exam, 'resolve_invite');
    const tokenHash = this.hashOpaqueToken(input.inviteToken);
    const invite = await this.deps.examInviteRepository.findByTokenHash(tokenHash);

    if (!invite || invite.examId !== exam.id) {
      throw new AppException('Invite not found', 404, 'INVITE_NOT_FOUND');
    }

    if (invite.revokedAt || invite.usedAt) {
      throw new AuthorizationException('Invite is no longer valid');
    }

    if (new Date() > new Date(invite.expiresAt)) {
      throw new AuthorizationException('Invite has expired');
    }

    const participant = await this.deps.examParticipantRepository.findById(invite.participantId);
    if (!participant || participant.mergedIntoParticipantId) {
      throw new AppException('Participant not found', 404, 'PARTICIPANT_NOT_FOUND');
    }

    await this.deps.examInviteRepository.markOpened(invite.id, new Date());

    const existingRealUser = await this.findExistingRealUserByEmail(participant.normalizedEmail);

    if (input.userId) {
      let resolvedParticipant = participant;

      if (!participant.userId) {
        const user = await this.deps.userRepository.findById(input.userId);
        if (!user || SanitizationUtils.sanitizeEmail(user.email) !== participant.normalizedEmail) {
          throw new AuthorizationException('Invite email does not match the authenticated user');
        }

        resolvedParticipant =
          (await this.deps.examParticipantRepository.bindUser(participant.id, input.userId)) ??
          participant;
      } else if (participant.userId !== input.userId) {
        throw new AuthorizationException('Invite does not belong to the authenticated user');
      }

      const entrySession = await this.ensureVerifiedEntrySession(
        exam,
        resolvedParticipant,
        'account_login',
        invite.id,
      );
      await this.deps.examInviteRepository.markUsed(invite.id, new Date());

      return this.buildAccessState(exam, resolvedParticipant, entrySession, null, input.userId);
    }

    if (participant.userId || existingRealUser) {
      const openedSession = await this.deps.examEntrySessionRepository.createOrResumeOpenedSession({
        examId: exam.id,
        participantId: participant.id,
        inviteId: invite.id,
        expiresAt: exam.endDate instanceof Date ? exam.endDate : new Date(exam.endDate),
      });

      return {
        participantId: participant.id,
        entrySessionId: openedSession.id,
        requiresLogin: true,
        requiresOtp: false,
        maskedEmail: this.maskEmail(participant.normalizedEmail),
        accessStatus: participant.accessStatus ?? 'invited',
      };
    }

    const openedSession = await this.deps.examEntrySessionRepository.createOrResumeOpenedSession({
      examId: exam.id,
      participantId: participant.id,
      inviteId: invite.id,
      expiresAt: exam.endDate instanceof Date ? exam.endDate : new Date(exam.endDate),
    });

    return {
      participantId: participant.id,
      entrySessionId: openedSession.id,
      requiresLogin: false,
      requiresOtp: true,
      maskedEmail: this.maskEmail(participant.normalizedEmail),
      accessStatus: participant.accessStatus ?? 'invited',
    };
  }

  async sendOtp(slug: string, input: { email: string; ipAddress?: string | null }) {
    const exam = await this.requireExamBySlug(slug);
    this.assertExamPublishedForAccess(exam, 'send_otp');
    const normalizedEmail = SanitizationUtils.sanitizeEmail(input.email);
    const participant = await this.deps.examParticipantRepository.findByExamAndIdentity(exam.id, {
      normalizedEmail,
      userId: null,
    });

    if (!participant) {
      throw new AppException('Participant not found', 404, 'PARTICIPANT_NOT_FOUND');
    }

    if (participant.approvalStatus !== 'approved') {
      throw new AuthorizationException('Participant has not been approved yet');
    }

    if (participant.userId || (await this.findExistingRealUserByEmail(normalizedEmail))) {
      throw new AuthorizationException(
        'Please sign in with your existing account to continue this exam',
      );
    }

    if (this.participantRequiresInviteFlow(exam, participant)) {
      await this.requireOpenedInviteEntrySession(exam, participant);
    }

    this.enforceOtpRateLimit(exam.id, normalizedEmail, input.ipAddress ?? 'unknown');
    this.enforceOtpCooldown(exam.id, normalizedEmail);

    await this.deps.emailService.sendVerificationCode(normalizedEmail);
    OTP_RESEND_COOLDOWNS.set(this.getOtpCooldownKey(exam.id, normalizedEmail), Date.now());

    return {
      sent: true,
      cooldownSeconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
    };
  }

  async verifyOtp(slug: string, input: VerifyOtpInput) {
    const exam = await this.requireExamBySlug(slug);
    this.assertExamPublishedForAccess(exam, 'verify_otp');
    const normalizedEmail = SanitizationUtils.sanitizeEmail(input.email);

    await this.deps.emailService.verifyOTP(normalizedEmail, input.otp);

    const participant = await this.deps.examParticipantRepository.findByExamAndIdentity(exam.id, {
      normalizedEmail,
      userId: null,
    });

    if (!participant) {
      throw new AppException('Participant not found', 404, 'PARTICIPANT_NOT_FOUND');
    }

    if (participant.approvalStatus !== 'approved') {
      throw new AuthorizationException('Participant has not been approved yet');
    }

    if (participant.userId || (await this.findExistingRealUserByEmail(normalizedEmail))) {
      throw new AuthorizationException(
        'Please sign in with your existing account to continue this exam',
      );
    }

    let invite = this.deps.examInviteRepository.findLatestActiveByParticipant
      ? await this.deps.examInviteRepository.findLatestActiveByParticipant(participant.id)
      : null;
    if (this.participantRequiresInviteFlow(exam, participant)) {
      const openedEntrySession = await this.requireOpenedInviteEntrySession(exam, participant);
      if (openedEntrySession.inviteId && (!invite || invite.id !== openedEntrySession.inviteId)) {
        invite = await this.deps.examInviteRepository.findById(openedEntrySession.inviteId);
      }
    }

    const user = await this.findOrCreateShadowUser(normalizedEmail, participant.fullName);

    const verifiedAt = new Date();
    await this.deps.examParticipantRepository.bindUser(participant.id, user.id);
    const entrySession = await this.ensureVerifiedEntrySession(
      exam,
      participant,
      'otp_email',
      invite?.id ?? null,
      verifiedAt,
      this.computeEntrySessionExpiresAt(exam.endDate, verifiedAt),
    );

    if (this.deps.examParticipantRepository.markJoined) {
      await this.deps.examParticipantRepository.markJoined(participant.id, verifiedAt);
    }
    await this.deps.examParticipantRepository.updateAccessStatus(participant.id, 'eligible');
    if (invite && !invite.usedAt) {
      await this.deps.examInviteRepository.markUsed(invite.id, verifiedAt);
    }

    const tokens = JWTUtils.generateTokenPair(user.id, user.email, user.role);
    await this.deps.tokenRepository.createRefreshToken({
      token: tokens.refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const accessState = await this.buildAccessState(
      exam,
      {
        ...participant,
        userId: user.id,
        accessStatus: 'eligible',
      },
      entrySession,
      null,
      user.id,
    );

    return {
      ...accessState,
      tokens,
    };
  }

  async getAccessState(slug: string, userId: string | null | undefined) {
    const exam = await this.requireExamBySlug(slug);
    this.assertExamPublishedForAccess(exam, 'get_access_state');
    if (!userId) {
      return this.emptyAccessState(exam);
    }

    const participant = await this.deps.examParticipantRepository.findByExamAndIdentity(exam.id, {
      userId,
    });

    if (!participant) {
      return this.emptyAccessState(exam);
    }

    const participation = await this.findPreferredParticipation(
      exam.id,
      participant.id,
      userId,
    );
    let entrySession = await this.deps.examEntrySessionRepository.findLatestByParticipant(
      participant.id,
    );
    entrySession = await this.persistExpiredEntrySessionIfNeeded(exam, entrySession);

    if (this.shouldAutoResumeEntrySession(exam, participant, participation)) {
      entrySession = await this.ensureVerifiedEntrySession(exam, participant, 'account_login');
    }

    if (this.isParticipationInProgress(participation) && participation?.id) {
      const linkedStartedSession = this.deps.examEntrySessionRepository.findByParticipationId
        ? await this.deps.examEntrySessionRepository.findByParticipationId(participation.id)
        : null;
      if (linkedStartedSession) {
        entrySession = await this.persistExpiredEntrySessionIfNeeded(exam, linkedStartedSession);
      }
    }

    return this.buildAccessState(exam, participant, entrySession, participation, userId);
  }

  async startEntrySession(entrySessionId: string, userId: string, examPassword?: string) {
    const session = await this.deps.examEntrySessionRepository.findById(entrySessionId);
    if (!session) {
      throw new AppException('Entry session not found', 404, 'ENTRY_SESSION_NOT_FOUND');
    }

    const participant = await this.deps.examParticipantRepository.findById(session.participantId);
    if (!participant || participant.userId !== userId) {
      throw new AuthorizationException('Unauthorized entry session');
    }

    if (session.status === 'started' && session.participationId) {
      const existingParticipation = await this.deps.examParticipationRepository.findById(
        session.participationId,
      );
      if (!existingParticipation) {
        throw new ExamParticipationNotFoundException('Participation not found');
      }

      return {
        participationId: existingParticipation.id,
        expiresAt: this.asIsoString(existingParticipation.expiresAt),
        firstChallengeId: await this.findFirstChallengeId(existingParticipation.examId),
      };
    }

    const exam = await this.deps.examRepository.findById(session.examId);
    if (!exam) {
      throw new ExamNotFoundException();
    }
    this.assertExamPublishedForAccess(exam, 'start_entry_session');

    const activeParticipation = await this.findActiveParticipationForUser(
      session.examId,
      participant.id,
      userId,
    );
    if (activeParticipation) {
      await this.deps.examEntrySessionRepository.markStarted(
        session.id,
        activeParticipation.id,
        new Date(),
      );
      if (this.deps.examParticipantRepository.updateAccessStatus) {
        await this.deps.examParticipantRepository.updateAccessStatus(participant.id, 'active');
      }

      return {
        participationId: activeParticipation.id,
        expiresAt: this.asIsoString(activeParticipation.expiresAt),
        firstChallengeId: await this.findFirstChallengeId(activeParticipation.examId),
      };
    }

    if (this.isEntrySessionExpired(session, exam.endDate)) {
      await this.persistExpiredEntrySessionIfNeeded(exam, session);
      throw new AuthorizationException('Entry session expired');
    }

    if (session.status !== 'eligible') {
      throw new AuthorizationException('Entry session is not ready to start');
    }

    const now = new Date();
    if (now < new Date(exam.startDate)) {
      throw new ExamNotStartedException();
    }

    if (now > new Date(exam.endDate)) {
      throw new ExamEndedException();
    }

    if (participant.accessStatus === 'revoked' || participant.accessStatus === 'completed') {
      throw new AuthorizationException('Participant cannot start this exam');
    }

    const attemptsUsed = await this.deps.examParticipationRepository.countAttemptsByParticipant(
      participant.id,
    );
    if (attemptsUsed >= exam.maxAttempts) {
      throw new AuthorizationException('Maximum attempts reached');
    }

    this.assertStartPasswordIfRequired(exam, participant, examPassword);

    const startedAt = new Date();
    const expiresAt = this.computeParticipationExpiresAt(startedAt, exam.duration, exam.endDate);
    const participation = await this.deps.examParticipationRepository.createAttempt({
      examId: exam.id,
      participantId: participant.id,
      userId,
      startTime: startedAt,
      expiresAt,
      attemptNumber: attemptsUsed + 1,
    });

    if (!participation) {
      throw new AppException('Failed to create participation', 500, 'PARTICIPATION_CREATE_FAILED');
    }

    await this.deps.examEntrySessionRepository.markStarted(session.id, participation.id, startedAt);
    await this.deps.examParticipantRepository.updateAccessStatus(participant.id, 'active');
    await this.writeAuditLog({
      examId: exam.id,
      actorType: 'user',
      actorId: userId,
      action: 'start_participation',
      targetType: 'exam_participation',
      targetId: participation.id,
      metadata: {
        entrySessionId: session.id,
        attemptNumber: attemptsUsed + 1,
      },
    });

    return {
      participationId: participation.id,
      expiresAt: this.asIsoString(participation.expiresAt),
      firstChallengeId: await this.findFirstChallengeId(exam.id),
    };
  }

  async syncParticipation(userId: string, input: SyncParticipationInput) {
    const participation = await this.deps.examParticipationRepository.findById(input.participationId);
    if (!participation || participation.userId !== userId) {
      throw new ExamParticipationNotFoundException('Participation not found');
    }

    if (`${participation.status}`.toUpperCase() === 'REVOKED') {
      throw new AuthorizationException('Participant access has been revoked');
    }

    if (participation.participantId && this.deps.examParticipantRepository.findById) {
      const participant = await this.deps.examParticipantRepository.findById(
        participation.participantId,
      );
      if (participant?.accessStatus === 'revoked') {
        throw new AuthorizationException('Participant access has been revoked');
      }
    }

    if (participation.status === EExamParticipationStatus.SUBMITTED) {
      return {
        synced: false,
        lastSyncedAt: this.asIsoString(participation.lastSyncedAt ?? new Date()),
        participationExpiresAt: this.asIsoString(participation.expiresAt),
        status: 'submitted' as const,
      };
    }

    const now = new Date();
    if (participation.expiresAt && now > new Date(participation.expiresAt)) {
      await this.finalizeExpiredParticipation(participation.id);
      return {
        synced: false,
        lastSyncedAt: this.asIsoString(now),
        participationExpiresAt: this.asIsoString(participation.expiresAt),
        status: 'expired' as const,
      };
    }

    await this.deps.examParticipationRepository.updateParticipation(participation.id, {
      currentAnswers: {
        ...(participation.currentAnswers || {}),
        ...input.answers,
      },
      lastSyncedAt: now,
    });

    return {
      synced: true,
      lastSyncedAt: this.asIsoString(now),
      participationExpiresAt: this.asIsoString(participation.expiresAt),
      status: 'active' as const,
    };
  }

  async submitActiveParticipation(slug: string, userId: string) {
    const exam = await this.requireExamBySlug(slug);
    const participant = await this.deps.examParticipantRepository.findByExamAndIdentity(exam.id, {
      userId,
    });

    if (!participant) {
      throw new AppException('Participant not found', 404, 'PARTICIPANT_NOT_FOUND');
    }

    const participations = await this.deps.examParticipationRepository.findByParticipantId(
      participant.id,
    );
    const activeParticipation = participations.find(
      (row: any) => row.status === EExamParticipationStatus.IN_PROGRESS,
    );

    if (!activeParticipation) {
      throw new ExamParticipationNotFoundException('Active participation not found');
    }

    const submittedAt = new Date();
    await this.deps.examParticipationRepository.updateParticipation(activeParticipation.id, {
      status: EExamParticipationStatus.SUBMITTED,
      submittedAt,
      endTime: submittedAt,
      submittedAnswersSnapshot: activeParticipation.currentAnswers || {},
      answersLockedAt: submittedAt,
      scoreStatus: 'pending',
    });

    const attemptsUsed = participations.length;
    const nextAccessStatus =
      attemptsUsed >= exam.maxAttempts || submittedAt > new Date(exam.endDate)
        ? 'completed'
        : 'eligible';
    await this.deps.examParticipantRepository.updateAccessStatus(participant.id, nextAccessStatus);

    await this.writeAuditLog({
      examId: exam.id,
      actorType: 'user',
      actorId: userId,
      action: 'submit_participation',
      targetType: 'exam_participation',
      targetId: activeParticipation.id,
      metadata: { scoreStatus: 'pending' },
    });

    return {
      participationId: activeParticipation.id,
      submittedAt: submittedAt.toISOString(),
      scoreStatus: 'pending',
    };
  }

  private assertExamConfiguration(input: {
    title?: string;
    slug?: string;
    duration?: number;
    allowExternalCandidates?: boolean;
    accessMode: string;
    selfRegistrationApprovalMode?: string | null;
    selfRegistrationPasswordRequired?: boolean;
    startDate: string;
    endDate: string;
    registrationOpenAt?: string | Date | null;
    registrationCloseAt?: string | Date | null;
    examPassword?: string | null;
    registrationPassword?: string | null;
    allowMissingRegistrationWindow?: boolean;
  }) {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      throw new ValidationException('Invalid exam time range');
    }

    if (input.accessMode === 'invite_only' && input.selfRegistrationApprovalMode != null) {
      throw new ValidationException('Invite-only exams cannot configure self-registration approval');
    }

    if (input.accessMode === 'invite_only' && input.selfRegistrationPasswordRequired) {
      throw new ValidationException('Invite-only exams cannot require a registration password');
    }

    if (input.accessMode !== 'invite_only' && input.selfRegistrationApprovalMode == null) {
      throw new ValidationException('Self-registration exams must declare an approval mode');
    }

    if (
      input.accessMode !== 'invite_only' &&
      input.selfRegistrationApprovalMode != null &&
      !input.allowMissingRegistrationWindow &&
      (!input.registrationOpenAt || !input.registrationCloseAt)
    ) {
      throw new ValidationException(
        'Self-registration exams must configure registration open and close times.',
      );
    }

    if (input.registrationOpenAt) {
      const registrationOpenAt = new Date(input.registrationOpenAt);
      if (registrationOpenAt >= startDate) {
        throw new ValidationException('Registration open time must be before the exam start time');
      }
    }

    if (input.registrationCloseAt) {
      const registrationCloseAt = new Date(input.registrationCloseAt);
      if (registrationCloseAt >= startDate) {
        throw new ValidationException('Registration close time must be before the exam start time');
      }
    }

    if (input.registrationOpenAt && input.registrationCloseAt) {
      const registrationOpenAt = new Date(input.registrationOpenAt);
      const registrationCloseAt = new Date(input.registrationCloseAt);
      if (registrationCloseAt <= registrationOpenAt) {
        throw new ValidationException('Registration close time must be after registration open time');
      }
    }

    if (input.selfRegistrationPasswordRequired) {
      const registrationPassword = input.examPassword ?? input.registrationPassword;
      if (typeof registrationPassword !== 'string' || !registrationPassword.trim()) {
        throw new ValidationException(
          'Exam password is required when registration password is enabled.',
        );
      }
    }
  }

  private async requireParticipant(examId: string, participantId: string) {
    const participant = await this.deps.examParticipantRepository.findById(participantId);
    if (!participant || participant.examId !== examId || participant.mergedIntoParticipantId) {
      throw new AppException('Participant not found', 404, 'PARTICIPANT_NOT_FOUND');
    }

    return participant;
  }

  private async requireUserById(userId: string) {
    const user = await this.deps.userRepository.findById(userId);
    if (!user) {
      throw new UserNotFoundException('User not found');
    }

    return user;
  }

  private async findOrCreateShadowUser(normalizedEmail: string, fullName: string) {
    const existingUser = await this.deps.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      return existingUser;
    }

    const generatedPassword = `Tmp!${TokenUtils.generateSecureToken(12)}Aa1`;
    try {
      return await this.deps.userRepository.createUser({
        email: normalizedEmail,
        password: await PasswordUtils.hashPassword(generatedPassword),
        firstName: fullName,
        lastName: '',
        status: 'active',
        role: 'user',
        rankingPoint: 0,
        isShadowAccount: true,
      });
    } catch (error) {
      const canonicalUser = await this.deps.userRepository.findByEmail(normalizedEmail);
      if (canonicalUser) {
        return canonicalUser;
      }

      throw error;
    }
  }

  private async findExistingRealUserByEmail(normalizedEmail: string) {
    const existingUser = await this.deps.userRepository.findByEmail(normalizedEmail);
    if (!existingUser || existingUser.isShadowAccount) {
      return null;
    }

    return existingUser;
  }

  private async mapParticipantSummary(exam: any, participant: any) {
    const latestInvite = this.deps.examInviteRepository.findLatestActiveByParticipant
      ? await this.deps.examInviteRepository.findLatestActiveByParticipant(participant.id)
      : null;
    const latestEntrySession = this.deps.examEntrySessionRepository.findLatestByParticipant
      ? await this.deps.examEntrySessionRepository.findLatestByParticipant(participant.id)
      : null;
    const latestParticipation = this.deps.examParticipationRepository.findLatestByParticipant
      ? await this.deps.examParticipationRepository.findLatestByParticipant(participant.id)
      : null;
    const attemptsUsed = this.deps.examParticipationRepository.countAttemptsByParticipant
      ? await this.deps.examParticipationRepository.countAttemptsByParticipant(participant.id)
      : 0;

    return {
      id: participant.id,
      examId: participant.examId,
      userId: participant.userId ?? null,
      normalizedEmail: participant.normalizedEmail,
      fullName: participant.fullName,
      source: participant.source,
      approvalStatus: participant.approvalStatus,
      accessStatus: participant.accessStatus ?? null,
      approvedBy: participant.approvedBy ?? null,
      inviteSentAt: participant.inviteSentAt ? this.asIsoString(participant.inviteSentAt) : null,
      joinedAt: participant.joinedAt ? this.asIsoString(participant.joinedAt) : null,
      latestInviteId: latestInvite?.id ?? null,
      latestInviteExpiresAt: latestInvite?.expiresAt ? this.asIsoString(latestInvite.expiresAt) : null,
      latestEntrySessionId: latestEntrySession?.id ?? null,
      latestEntrySessionStatus: latestEntrySession?.status ?? null,
      latestParticipationId: latestParticipation?.id ?? null,
      latestParticipationStatus: latestParticipation?.status ?? null,
      attemptsUsed,
      canUseInviteLink: this.participantRequiresInviteFlow(exam, participant),
      isMerged: !!participant.mergedIntoParticipantId,
      mergedIntoParticipantId: participant.mergedIntoParticipantId ?? null,
    };
  }

  private resolveMergedApprovalStatus(left?: string | null, right?: string | null) {
    const priorities = ['rejected', 'pending', 'approved'];
    return priorities.reduce((winner, current) => {
      if (left === current || right === current) {
        return current;
      }

      return winner;
    }, 'rejected');
  }

  private resolveMergedAccessStatus(left?: string | null, right?: string | null) {
    const priorities = ['null', 'revoked', 'completed', 'invited', 'eligible', 'active'];
    const normalize = (value?: string | null) => value ?? 'null';
    const leftPriority = priorities.indexOf(normalize(left));
    const rightPriority = priorities.indexOf(normalize(right));
    const winner = leftPriority >= rightPriority ? normalize(left) : normalize(right);
    return winner === 'null' ? null : winner;
  }

  private async notifyParticipantsAboutScheduleChange(examId: string, exam: any) {
    const participants = await this.deps.examParticipantRepository.findByExamId(examId);
    await Promise.all(
      participants.map((participant: any) =>
        this.deps.emailService?.sendExamRescheduledEmail?.({
          to: participant.normalizedEmail,
          examTitle: exam.title,
          examSlug: exam.slug,
          startDate: exam.startDate,
          endDate: exam.endDate,
        }),
      ),
    );
  }

  private async sendParticipantInviteEmail(exam: any, participant: any, inviteToken: string) {
    await this.deps.emailService?.sendExamParticipantInviteEmail?.({
      to: participant.normalizedEmail,
      fullName: participant.fullName,
      examTitle: exam.title,
      examSlug: exam.slug,
      inviteToken,
      startDate: exam.startDate,
      endDate: exam.endDate,
    });
  }

  private async sendParticipantDecisionEmail(
    exam: any,
    participant: any,
    decision: 'approved' | 'rejected',
    registrationPassword?: string | null,
  ) {
    await this.deps.emailService?.sendExamParticipantDecisionEmail?.({
      to: participant.normalizedEmail,
      fullName: participant.fullName,
      examTitle: exam.title,
      examSlug: exam.slug,
      decision,
      registrationPassword,
    });
  }

  private async sendRegistrationReceivedEmail(
    exam: any,
    participant: any,
    registrationPassword?: string | null,
  ) {
    await this.deps.emailService?.sendExamRegistrationReceivedEmail?.({
      to: participant.normalizedEmail,
      fullName: participant.fullName,
      examTitle: exam.title,
      examSlug: exam.slug,
      approvalStatus: participant.approvalStatus,
      registrationPassword,
    });
  }

  private getRegistrationPasswordForEmail(exam: any): string | null {
    if (!exam.selfRegistrationPasswordRequired || typeof exam.registrationPassword !== 'string') {
      return null;
    }

    return exam.registrationPassword.trim() ? exam.registrationPassword : null;
  }

  private async requireExamBySlug(slug: string) {
    const exam = await this.deps.examRepository.findBySlug(slug);
    if (!exam) {
      throw new ExamNotFoundException();
    }

    return exam;
  }

  private assertExamPublishedForAccess(exam: any, action: string) {
    if (exam.status === 'published') {
      return;
    }

    throw new AppException('Exam is not available for access', 403, 'EXAM_NOT_AVAILABLE', {
      action,
      examId: exam.id,
      currentStatus: exam.status,
    });
  }

  private async assertUniqueSlug(slug: string) {
    const existing = await this.deps.examRepository.findBySlug(slug);
    if (existing) {
      throw new AppException('Exam slug already exists', 409, 'EXAM_SLUG_CONFLICT');
    }
  }

  private async assertRegistrationWindow(exam: any) {
    const now = new Date();
    const registrationWindow = this.getRegistrationWindow(exam);
    if (!registrationWindow) {
      throw new AuthorizationException('Registration window is not configured');
    }

    if (now < registrationWindow.openAt) {
      throw new AuthorizationException('Registration not open yet');
    }

    if (now >= registrationWindow.closeAt) {
      throw new AuthorizationException('Registration closed');
    }
  }

  private isRegistrationWindowOpen(exam: any, now = new Date()) {
    const registrationWindow = this.getRegistrationWindow(exam);
    return (
      !!registrationWindow &&
      now >= registrationWindow.openAt &&
      now < registrationWindow.closeAt
    );
  }

  private getRegistrationWindow(exam: any): { openAt: Date; closeAt: Date } | null {
    if (!exam.registrationOpenAt || !exam.registrationCloseAt) {
      return null;
    }

    const openAt = new Date(exam.registrationOpenAt);
    const closeAt = new Date(exam.registrationCloseAt);
    const startAt = new Date(exam.startDate);
    if (
      Number.isNaN(openAt.getTime()) ||
      Number.isNaN(closeAt.getTime()) ||
      Number.isNaN(startAt.getTime()) ||
      closeAt <= openAt ||
      closeAt >= startAt
    ) {
      return null;
    }

    return { openAt, closeAt };
  }

  private async mapAdminExam(exam: any) {
    const challengeLinks = this.deps.examToProblemsRepository.findDetailedByExamId
      ? await this.deps.examToProblemsRepository.findDetailedByExamId(exam.id)
      : await this.deps.examToProblemsRepository.findByExamId(exam.id);
    return {
      id: exam.id,
      slug: exam.slug,
      title: exam.title,
      duration: exam.duration,
      startDate: this.asIsoString(exam.startDate),
      endDate: this.asIsoString(exam.endDate),
      isVisible: exam.isVisible,
      maxAttempts: exam.maxAttempts,
      createdBy: exam.createdBy ?? null,
      status: exam.status,
      accessMode: exam.accessMode,
      selfRegistrationApprovalMode: exam.selfRegistrationApprovalMode ?? null,
      selfRegistrationPasswordRequired: exam.selfRegistrationPasswordRequired,
      allowExternalCandidates: exam.allowExternalCandidates,
      registrationOpenAt: exam.registrationOpenAt
        ? this.asIsoString(exam.registrationOpenAt)
        : null,
      registrationCloseAt: exam.registrationCloseAt
        ? this.asIsoString(exam.registrationCloseAt)
        : null,
      challengeCount: challengeLinks.length,
      challenges: challengeLinks
        .sort((left: any, right: any) => left.orderIndex - right.orderIndex)
        .map((link: any) => ({
          challengeId: link.problemId,
          orderIndex: link.orderIndex,
          type: 'existing',
          title: link.title ?? '',
          description: link.description ?? '',
          difficulty: link.difficulty ?? 'easy',
          visibility: link.visibility ?? 'public',
          topicName: link.topicName ?? '',
          createdAt: link.createdAt ? this.asIsoString(link.createdAt) : null,
        })),
      createdAt: this.asIsoString(exam.createdAt),
      updatedAt: this.asIsoString(exam.updatedAt),
    };
  }

  private async ensureVerifiedEntrySession(
    exam: any,
    participant: any,
    verificationMethod: string,
    inviteId?: string | null,
    verifiedAt: Date = new Date(),
    expiresAt: Date = this.computeEntrySessionExpiresAt(exam.endDate, new Date()),
  ) {
    return this.deps.examEntrySessionRepository.createOrResumeVerifiedSession({
      examId: exam.id,
      participantId: participant.id,
      inviteId: inviteId ?? null,
      verificationMethod,
      verifiedAt,
      expiresAt,
    });
  }

  private async buildAccessState(
    exam: any,
    participant: any,
    entrySession: any,
    participation: any,
    userId: string | null,
  ) {
    const effectiveEntrySessionStatus =
      entrySession && this.isEntrySessionExpired(entrySession, exam.endDate)
        ? 'expired'
        : entrySession?.status ?? null;
    const attemptsUsed =
      participant?.id && this.deps.examParticipationRepository.countAttemptsByParticipant
        ? await this.deps.examParticipationRepository.countAttemptsByParticipant(participant.id)
        : 0;

    const canStart =
      effectiveEntrySessionStatus === 'eligible' &&
      new Date() >= new Date(exam.startDate) &&
      new Date() <= new Date(exam.endDate) &&
      attemptsUsed < exam.maxAttempts &&
      !['revoked', 'completed'].includes(participant?.accessStatus ?? '');
    const requiresLogin =
      !userId &&
      !!participant &&
      (!!participant.userId ||
        !!(participant.normalizedEmail
          ? await this.findExistingRealUserByEmail(participant.normalizedEmail)
          : null));

    const requiresPassword = participant
      ? this.participantRequiresStartPassword(exam, participant) &&
        effectiveEntrySessionStatus === 'eligible' &&
        !this.isParticipationInProgress(participation) &&
        !['revoked', 'completed'].includes(participant?.accessStatus ?? '')
      : exam.accessMode !== 'invite_only' && !!exam.selfRegistrationPasswordRequired;

    return {
      examId: exam.id,
      participantId: participant?.id ?? null,
      entrySessionId: entrySession?.id ?? null,
      participationId: participation?.id ?? entrySession?.participationId ?? null,
      approvalStatus: participant?.approvalStatus ?? null,
      accessStatus: participant?.accessStatus ?? null,
      entrySessionStatus: effectiveEntrySessionStatus,
      canStart,
      examStartsAt: this.asIsoString(exam.startDate ?? exam.endDate),
      participationExpiresAt:
        participation?.expiresAt ? this.asIsoString(participation.expiresAt) : null,
      requiresLogin,
      requiresOtp: !userId && !!participant && !requiresLogin,
      requiresPassword,
    };
  }

  private participantRequiresInviteFlow(exam: any, participant: any) {
    return exam.accessMode !== 'open_registration' && participant?.source !== 'self_registration';
  }

  private participantUsesSelfRegistrationPath(participant: any) {
    return participant?.source === 'self_registration';
  }

  private participantRequiresStartPassword(exam: any, participant: any) {
    return (
      !!exam.selfRegistrationPasswordRequired &&
      this.participantUsesSelfRegistrationPath(participant)
    );
  }

  private assertStartPasswordIfRequired(exam: any, participant: any, examPassword?: string) {
    if (!this.participantRequiresStartPassword(exam, participant)) {
      return;
    }

    const registrationPassword = this.getRegistrationPasswordForEmail(exam);
    if (!registrationPassword || examPassword !== registrationPassword) {
      throw new InvalidPasswordException('Incorrect exam password');
    }
  }

  private shouldAutoResumeEntrySession(exam: any, participant: any, participation: any) {
    return (
      participant?.approvalStatus === 'approved' &&
      participant?.accessStatus !== 'completed' &&
      participant?.accessStatus !== 'revoked' &&
      new Date() <= new Date(exam.endDate) &&
      !this.isParticipationInProgress(participation) &&
      !this.participantRequiresInviteFlow(exam, participant)
    );
  }

  private isParticipationInProgress(participation: any) {
    if (!participation) {
      return false;
    }

    const normalizedStatus = `${participation.status ?? ''}`.toUpperCase();
    return (
      normalizedStatus === `${EExamParticipationStatus.IN_PROGRESS}`.toUpperCase() ||
      normalizedStatus === 'STARTED'
    );
  }

  private async persistExpiredEntrySessionIfNeeded(exam: any, entrySession: any) {
    if (!entrySession || entrySession.status === 'expired') {
      return entrySession;
    }

    if (!this.isEntrySessionExpired(entrySession, exam.endDate)) {
      return entrySession;
    }

    const expiredSession = await this.deps.examEntrySessionRepository.markExpired(entrySession.id);
    await this.writeAuditLog({
      examId: exam.id,
      actorType: 'system',
      actorId: null,
      action: 'auto_expire_session',
      targetType: 'exam_entry_session',
      targetId: entrySession.id,
      metadata: null,
    });

    return expiredSession ?? { ...entrySession, status: 'expired' };
  }

  private async findActiveParticipationForUser(
    examId: string,
    participantId: string,
    userId: string,
  ) {
    const inProgressByExamAndUser = this.deps.examParticipationRepository
      .findInProgressByExamAndUser
      ? await this.deps.examParticipationRepository.findInProgressByExamAndUser(examId, userId)
      : null;

    if (inProgressByExamAndUser && `${inProgressByExamAndUser.participantId}` === `${participantId}`) {
      return inProgressByExamAndUser;
    }

    const latestByParticipant = this.deps.examParticipationRepository.findLatestByParticipant
      ? await this.deps.examParticipationRepository.findLatestByParticipant(participantId)
      : null;

    return this.isParticipationInProgress(latestByParticipant) ? latestByParticipant : null;
  }

  private async findPreferredParticipation(
    examId: string,
    participantId: string,
    userId: string,
  ) {
    const activeParticipation = await this.findActiveParticipationForUser(
      examId,
      participantId,
      userId,
    );
    if (activeParticipation) {
      return activeParticipation;
    }

    return this.deps.examParticipationRepository.findLatestByParticipant
      ? this.deps.examParticipationRepository.findLatestByParticipant(participantId)
      : null;
  }

  private async requireOpenedInviteEntrySession(exam: any, participant: any) {
    const latestEntrySession = this.deps.examEntrySessionRepository.findLatestByParticipant
      ? await this.deps.examEntrySessionRepository.findLatestByParticipant(participant.id)
      : null;
    const resolvedEntrySession = await this.persistExpiredEntrySessionIfNeeded(exam, latestEntrySession);

    if (!resolvedEntrySession || resolvedEntrySession.status !== 'opened') {
      throw new AuthorizationException('Invite link is required before requesting OTP');
    }

    return resolvedEntrySession;
  }

  private emptyAccessState(exam: any) {
    return {
      examId: exam.id,
      participantId: null,
      entrySessionId: null,
      participationId: null,
      approvalStatus: null,
      accessStatus: null,
      entrySessionStatus: null,
      canStart: false,
      examStartsAt: this.asIsoString(exam.startDate ?? exam.endDate),
      participationExpiresAt: null,
      requiresLogin: false,
      requiresOtp: false,
      requiresPassword: exam.accessMode !== 'invite_only' && !!exam.selfRegistrationPasswordRequired,
    };
  }

  private computeEntrySessionExpiresAt(examEndDate: Date | string, verifiedAt: Date) {
    const verifiedPlus48h = new Date(verifiedAt.getTime() + 48 * 60 * 60 * 1000);
    const examEndsAt = examEndDate instanceof Date ? examEndDate : new Date(examEndDate);

    return verifiedPlus48h.getTime() >= examEndsAt.getTime() ? verifiedPlus48h : examEndsAt;
  }

  private computeParticipationExpiresAt(
    startTime: Date,
    durationMinutes: number,
    examEndDate: Date | string,
  ) {
    const durationEnd = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
    const examEndsAt = examEndDate instanceof Date ? examEndDate : new Date(examEndDate);

    return durationEnd.getTime() <= examEndsAt.getTime() ? durationEnd : examEndsAt;
  }

  private isEntrySessionExpired(session: any, examEndDate: Date | string) {
    const now = Date.now();
    const sessionExpiresAt = session.expiresAt ? new Date(session.expiresAt).getTime() : 0;
    const examEndsAt =
      examEndDate instanceof Date ? examEndDate.getTime() : new Date(examEndDate).getTime();

    return now > sessionExpiresAt || now > examEndsAt;
  }

  private enforceRegistrationRateLimit(examId: string, normalizedEmail: string) {
    const result = RateLimitUtils.checkRateLimit(
      `exam:${examId}:register:${normalizedEmail}`,
      5,
      REGISTRATION_RATE_LIMIT_WINDOW_MS,
    );

    if (!result.allowed) {
      throw new RateLimitExceededException('Too many registration attempts');
    }
  }

  private enforceOtpRateLimit(examId: string, normalizedEmail: string, ipAddress: string) {
    const emailLimit = RateLimitUtils.checkRateLimit(
      `exam:${examId}:otp:${normalizedEmail}`,
      5,
      OTP_RATE_LIMIT_WINDOW_MS,
    );
    if (!emailLimit.allowed) {
      throw new RateLimitExceededException('Too many OTP requests for this email');
    }

    const ipLimit = RateLimitUtils.checkRateLimit(
      `exam:${examId}:otp-ip:${ipAddress}`,
      20,
      OTP_RATE_LIMIT_WINDOW_MS,
    );
    if (!ipLimit.allowed) {
      throw new RateLimitExceededException('Too many OTP requests from this IP');
    }
  }

  private enforceOtpCooldown(examId: string, normalizedEmail: string) {
    const key = this.getOtpCooldownKey(examId, normalizedEmail);
    const lastSentAt = OTP_RESEND_COOLDOWNS.get(key);
    if (lastSentAt && Date.now() - lastSentAt < OTP_RESEND_COOLDOWN_MS) {
      throw new RateLimitExceededException('OTP resend cooldown is still active');
    }
  }

  private getOtpCooldownKey(examId: string, normalizedEmail: string) {
    return `${examId}:${normalizedEmail}`;
  }

  private hashOpaqueToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private maskEmail(email: string) {
    const [localPart = '', domain = ''] = email.split('@');
    if (localPart.length <= 2) {
      return `${localPart[0] ?? '*'}***@${domain}`;
    }

    return `${localPart.slice(0, 2)}***@${domain}`;
  }

  private async findFirstChallengeId(examId: string): Promise<string | null> {
    if (!this.deps.examToProblemsRepository.findByExamId) {
      return null;
    }
    const challengeLinks = await this.deps.examToProblemsRepository.findByExamId(examId);
    const first = [...challengeLinks].sort(
      (left: any, right: any) => left.orderIndex - right.orderIndex,
    )[0];
    return first?.problemId ?? null;
  }

  private async finalizeExpiredParticipation(participationId: string) {
    const participation = await this.deps.examParticipationRepository.findById(participationId);
    if (!participation) {
      return null;
    }

    const finalizedAt = new Date();
    const updated = await this.deps.examParticipationRepository.updateParticipation(participationId, {
      status: EExamParticipationStatus.EXPIRED,
      endTime: finalizedAt,
      submittedAt: participation.expiresAt ?? finalizedAt,
      submittedAnswersSnapshot: participation.currentAnswers || {},
      answersLockedAt: finalizedAt,
      scoreStatus: 'pending',
    });

    if (participation.participantId) {
      await this.deps.examParticipantRepository.updateAccessStatus(
        participation.participantId,
        'completed',
      );
    }

    if (updated) {
      await this.writeAuditLog({
        examId: participation.examId,
        actorType: 'system',
        actorId: null,
        action: 'auto_expire_participation',
        targetType: 'exam_participation',
        targetId: participation.id,
        metadata: null,
      });
    }

    return updated;
  }

  private async writeAuditLog(input: {
    examId: string;
    actorType: 'user' | 'system';
    actorId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    metadata: Record<string, unknown> | null;
  }) {
    await this.deps.examAuditLogRepository.create({
      examId: input.examId,
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
    });
  }

  private asIsoString(value: Date | string | null | undefined) {
    if (!value) {
      return new Date(0).toISOString();
    }

    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }
}

export function createExamAccessService() {
  return new ExamAccessService({
    examRepository: createExamRepository(),
    examToProblemsRepository: new ExamToProblemsRepository(),
    examParticipationRepository: new ExamParticipationRepository(),
    examParticipantRepository: new ExamParticipantRepository(),
    examInviteRepository: new ExamInviteRepository(),
    examEntrySessionRepository: new ExamEntrySessionRepository(),
    examAuditLogRepository: new ExamAuditLogRepository(),
    userRepository: new UserRepository(),
    tokenRepository: new TokenRepository(),
    emailService: createEMailService(),
  });
}
