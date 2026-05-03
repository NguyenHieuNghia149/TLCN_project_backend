import { createExamRepository, ExamRepository } from '../repositories/exam.repository';
import { ExamToProblemsRepository } from '../repositories/examToProblems.repository';
import { ExamParticipationRepository } from '../repositories/examParticipation.repository';
import { ProblemRepository } from '../repositories/problem.repository';
import { SubmissionRepository } from '../repositories/submission.repository';
import { TestcaseRepository } from '../repositories/testcase.repository';
import { ResultSubmissionRepository } from '../repositories/result-submission.repository';
import { UserRepository } from '../repositories/user.repository';
import { CreateExamInput, ExamResponse } from '@backend/shared/validations/exam.validation';
import { ProblemInput } from '@backend/shared/validations/problem.validation';
import {
  exam,
  examToProblems,
  problems,
  testcases,
  solutions,
  solutionApproaches,
  examParticipations,
} from '@backend/shared/db/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { NotFoundException } from '../exceptions/solution.exception';
import { ProblemVisibility } from '@backend/shared/types';
import { EExamParticipationStatus } from '@backend/shared/types';
// Service should not use raw `db` directly; repositories manage DB access and transactions.
import { BaseException } from '../exceptions/auth.exceptions';
import {
  ExamNotFoundException,
  InvalidPasswordException,
  ExamAlreadyJoinedException,
  ExamTimeoutException,
  ExamParticipationNotFoundException,
  ExamNotStartedException,
  ExamEndedException,
} from '../exceptions/exam.exceptions';
import { ESubmissionStatus } from '@backend/shared/types';
import { ChallengeService, createChallengeService } from './challenge.service';
import { createNotificationService } from './notification.service';

export interface INotificationPublisher {
  notifyAllUsers(type: string, title: string, message: string, metadata?: unknown): Promise<void>;
}

type ExamServiceDependencies = {
  examRepository: ExamRepository;
  examToProblemsRepository: ExamToProblemsRepository;
  examParticipationRepository: ExamParticipationRepository;
  problemRepository: ProblemRepository;
  submissionRepository: SubmissionRepository;
  testcaseRepository: TestcaseRepository;
  resultSubmissionRepository: ResultSubmissionRepository;
  userRepository: UserRepository;
  challengeService: ChallengeService;
  getNotificationPublisher?: () => INotificationPublisher;
};

export class ExamService {
  private examRepository: ExamRepository;
  private examToProblemsRepository: ExamToProblemsRepository;
  private examParticipationRepository: ExamParticipationRepository;
  private problemRepository: ProblemRepository;
  private submissionRepository: SubmissionRepository;
  private testcaseRepository: TestcaseRepository;
  private resultSubmissionRepository: ResultSubmissionRepository;
  private userRepository: UserRepository;
  private challengeService: ChallengeService;
  private readonly getNotificationPublisher: () => INotificationPublisher;

  constructor(deps: ExamServiceDependencies) {
    this.examRepository = deps.examRepository;
    this.examToProblemsRepository = deps.examToProblemsRepository;
    this.examParticipationRepository = deps.examParticipationRepository;
    this.problemRepository = deps.problemRepository;
    this.submissionRepository = deps.submissionRepository;
    this.testcaseRepository = deps.testcaseRepository;
    this.resultSubmissionRepository = deps.resultSubmissionRepository;
    this.userRepository = deps.userRepository;
    this.challengeService = deps.challengeService;
    this.getNotificationPublisher =
      deps.getNotificationPublisher ?? (() => createNotificationService());
  }

  /**
   * Get or create an exam session for a user. Returns session data including currentAnswers and expiresAt.
   * If an IN_PROGRESS participation exists, return it. Otherwise create a new one.
   */
  async getOrCreateSession(
    examId: string,
    userId: string
  ): Promise<{
    sessionId: string;
    examId: string;
    userId: string;
    startedAt: string;
    expiresAt: string;
    currentAnswers: any;
    status: string;
  }> {
    // Step 1: Try to find existing IN_PROGRESS participation
    const existing = await this.examParticipationRepository.findInProgressByExamAndUser(
      examId,
      userId
    );

    if (existing) {
      // Step 2: Validate expiration BEFORE returning
      const now = new Date();
      if (existing.expiresAt && now > existing.expiresAt) {
        // Auto-finalize as EXPIRED
        await this.examParticipationRepository.updateParticipation(existing.id, {
          status: EExamParticipationStatus.EXPIRED,
          endTime: now,
          submittedAt: existing.expiresAt, // Use original expiry time
        });

        throw new ExamTimeoutException();
      }

      // Step 3: Return valid session
      return {
        sessionId: existing.id,
        examId: existing.examId,
        userId: existing.userId,
        startedAt:
          existing.startTime instanceof Date
            ? existing.startTime.toISOString()
            : String(existing.startTime),
        expiresAt:
          existing.expiresAt instanceof Date
            ? existing.expiresAt.toISOString()
            : String(existing.expiresAt),
        currentAnswers: existing.currentAnswers || {},
        status: existing.status,
      };
    }

    // Step 4: Check if user already completed this exam
    const completed = await this.examParticipationRepository.findCompletedByExamAndUser(
      examId,
      userId
    );

    if (completed) {
      throw new BaseException(
        'You have already completed this exam',
        400,
        'EXAM_ALREADY_COMPLETED'
      );
    }

    // Step 5: No existing participation → create new one
    const examData = await this.examRepository.findById(examId);
    if (!examData) throw new ExamNotFoundException();

    const now = new Date();
    const expiresAt = this.calculateEffectiveEndTime(now, examData.duration || 0, examData.endDate);

    const [participation] =
      await this.examParticipationRepository.createExamParticipationWithExpiry(
        examId,
        userId,
        now,
        expiresAt
      );

    if (!participation) {
      throw new BaseException(
        'Failed to create participation',
        500,
        'FAILED_TO_CREATE_PARTICIPATION'
      );
    }

    const updated = await this.examParticipationRepository.updateParticipation(participation.id, {
      currentAnswers: {},
      lastSyncedAt: now,
      status: EExamParticipationStatus.IN_PROGRESS,
    });

    if (!updated) {
      throw new BaseException(
        'Failed to update participation with session fields',
        500,
        'FAILED_TO_UPDATE_PARTICIPATION'
      );
    }

    return {
      sessionId: updated.id,
      examId: updated.examId,
      userId: updated.userId,
      startedAt:
        updated.startTime instanceof Date
          ? updated.startTime.toISOString()
          : String(updated.startTime),
      expiresAt:
        updated.expiresAt instanceof Date
          ? updated.expiresAt.toISOString()
          : String(updated.expiresAt),
      currentAnswers: {},
      status: updated.status,
    };
  }

  async syncSession(sessionId: string, answers: any, clientTimestamp?: string): Promise<boolean> {
    const now = new Date();

    const existing = await this.examParticipationRepository.findById(sessionId);
    if (!existing) {
      throw new ExamParticipationNotFoundException();
    }

    const merged = this.mergeAnswers(existing.currentAnswers || {}, answers || {});

    const updated = await this.examParticipationRepository.updateParticipation(sessionId, {
      currentAnswers: merged,
      lastSyncedAt: now,
    });

    return !!updated;
  }

  private mergeAnswers(existingAnswers: any, incomingAnswers: any): any {
    const merged: Record<string, any> = { ...existingAnswers };

    for (const key of Object.keys(incomingAnswers)) {
      try {
        const incomingItem = incomingAnswers[key] || {};
        const existingItem = existingAnswers[key] || {};

        const incomingUpdated = this.parseTimestamp(
          incomingItem.updatedAt ||
            incomingItem.updated_at ||
            incomingItem.ts ||
            incomingItem.clientTimestamp
        );
        const existingUpdated = this.parseTimestamp(
          existingItem.updatedAt ||
            existingItem.updated_at ||
            existingItem.ts ||
            existingItem.clientTimestamp
        );

        const accept = incomingUpdated === 0 || incomingUpdated >= existingUpdated;

        if (accept) {
          merged[key] = {
            ...existingItem,
            ...incomingItem,
          };
        }
      } catch (err) {
        merged[key] = existingAnswers[key] || incomingAnswers[key];
      }
    }

    return merged;
  }

  private parseTimestamp(v: unknown): number {
    if (!v) return 0;
    const s = String(v);
    const n = Number(s);
    if (!Number.isNaN(n) && isFinite(n)) return n;
    const p = Date.parse(s);
    if (!Number.isNaN(p)) return p;
    return 0;
  }

  private calculateEffectiveEndTime(
    startTime: Date,
    durationMinutes: number,
    examEndDate: Date | string
  ): Date {
    const startMs = startTime.getTime();
    const durationMs = (durationMinutes || 0) * 60 * 1000;
    const participationEndByDuration = new Date(startMs + durationMs);
    const examGlobalEnd = examEndDate instanceof Date ? examEndDate : new Date(examEndDate);

    return participationEndByDuration.getTime() <= examGlobalEnd.getTime()
      ? participationEndByDuration
      : examGlobalEnd;
  }

  async createExam(examData: CreateExamInput): Promise<ExamResponse> {
    const { challenges, ...examFields } = examData;

    // Delegate the full create-with-challenges operation to the repository so
    // the service does not open transactions or interact with the DB directly.
    const createdExamId = await this.examRepository.createExamWithChallenges(
      {
        title: examFields.title,
        registrationPassword: examFields.password,
        duration: examFields.duration,
        startDate: new Date(examFields.startDate),
        endDate: new Date(examFields.endDate),
        isVisible: examFields.isVisible ?? false,
        maxAttempts: examFields.maxAttempts ?? 1,
      } as any,
      challenges
    );

    // Previously we fetched/validated problems here; that now lives inside the repository.
    // Fetch created exam with challenges for response (outside transaction, after commit)
    const newExam = await this.getExamById(createdExamId);

    if (newExam.isVisible) {
      setImmediate(async () => {
        try {
          const notificationPublisher = this.getNotificationPublisher();
          await notificationPublisher.notifyAllUsers(
            'NEW_EXAM',
            `New Exam: ${newExam.title}`,
            `A new exam has been created. Start: ${new Date(newExam.startDate).toLocaleString()}`,
            { examId: newExam.id, link: `/exams/${newExam.id}` }
          );
        } catch (err) {
          throw new Error('Failed to send exam notification');
        }
      });
    }

    return newExam;
  }

  async updateExam(
    examId: string,
    examData: Partial<CreateExamInput> & { id?: string }
  ): Promise<ExamResponse> {
    // Check for existing participations
    const participations = await this.examParticipationRepository.findByExamId(examId);
    const hasParticipations = participations.length > 0;

    const { challenges, ...fields } = examData;

    // Map frontend fields back to DB columns if necessary
    const dbFields: any = {};
    if (fields.title) dbFields.title = fields.title;
    if (fields.password !== undefined) {
      dbFields.registrationPassword = fields.password;
    }
    if (fields.duration) dbFields.duration = fields.duration;
    if (fields.startDate) dbFields.startDate = new Date(fields.startDate);
    if (fields.endDate) dbFields.endDate = new Date(fields.endDate);
    if (fields.isVisible !== undefined) dbFields.isVisible = fields.isVisible;
    if (fields.maxAttempts !== undefined) dbFields.maxAttempts = fields.maxAttempts;

    if (hasParticipations) {
      // Validate that restricted fields are NOT being changed
      const existingExam = await this.examRepository.findById(examId);
      if (!existingExam) {
        throw new NotFoundException(`Exam with ID ${examId} not found.`);
      }

      // Helper to check date equality (within 1 second tolerance)
      const isDateDiff = (d1: Date | string, d2: Date) => {
        const t1 = new Date(d1).getTime();
        const t2 = d2.getTime();
        return Math.abs(t1 - t2) > 1000;
      };

      const isDurationChanged =
        fields.duration !== undefined && fields.duration !== existingExam.duration;
      const isStartChanged =
        fields.startDate && isDateDiff(fields.startDate, existingExam.startDate);
      const isEndChanged = fields.endDate && isDateDiff(fields.endDate, existingExam.endDate);
      const isMaxAttemptsChanged =
        fields.maxAttempts !== undefined && fields.maxAttempts !== existingExam.maxAttempts;

      if (isDurationChanged || isStartChanged || isEndChanged || isMaxAttemptsChanged) {
        throw new BaseException(
          'Cannot update duration, dates, or max attempts: Users have already participated in this exam.',
          400,
          'EXAM_HAS_PARTICIPATIONS'
        );
      }

      // Check if challenges changed ONLY if challenges are provided in the update
      if (challenges !== undefined) {
        const currentLinks = await this.examToProblemsRepository.findByExamId(examId);
        // Sort and map local challenges
        const incomingList = challenges
          .map((ch: any, index: number) => ({
            id: ch.challengeId || ch.id,
            order: ch.orderIndex ?? index,
          }))
          .sort((a: any, b: any) => a.order - b.order);

        const currentList = currentLinks
          .map((l: any) => ({
            id: l.problemId,
            order: l.orderIndex,
          }))
          .sort((a: any, b: any) => a.order - b.order);

        let isChallengesChanged = incomingList.length !== currentList.length;
        if (!isChallengesChanged) {
          for (let i = 0; i < incomingList.length; i++) {
            const inc = incomingList[i];
            const cur = currentList[i];
            if (!inc || !cur || inc.id !== cur.id || inc.order !== cur.order) {
              isChallengesChanged = true;
              break;
            }
          }
        }

        if (isChallengesChanged) {
          throw new BaseException(
            'Cannot update challenges: Users have already participated in this exam.',
            400,
            'EXAM_HAS_PARTICIPATIONS'
          );
        }
      }

      // If we reach here, it's a safe update (only title, registrationPassword, visibility changed)
      // We can use the simple update method
      await this.examRepository.update(examId, dbFields);
      return this.getExamById(examId);
    }

    // Normal update for exams without participations
    if (challenges !== undefined) {
      // Update exam AND challenges (wipe existing logic in repo is fine here because we provide new set)
      const challengeLinks = challenges.map((ch: any, index: number) => ({
        challengeId: ch.challengeId || ch.id,
        orderIndex: ch.orderIndex ?? index,
      }));

      await this.examRepository.updateExamWithChallenges(examId, dbFields, challengeLinks);
    } else {
      // Only update fields, preserve existing challenges
      await this.examRepository.update(examId, dbFields);
    }

    return this.getExamById(examId);
  }

  async deleteExam(examId: string): Promise<boolean> {
    const existing = await this.examRepository.findById(examId);
    if (!existing) {
      throw new ExamNotFoundException();
    }

    // Check for existing participations
    const participations = await this.examParticipationRepository.findByExamId(examId);
    if (participations.length > 0) {
      throw new BaseException(
        'Cannot delete exam: Users have already participated in this exam.',
        400,
        'EXAM_HAS_PARTICIPATIONS'
      );
    }

    return this.examRepository.deleteExamWithRelations(examId);
  }

  async getExamById(examId: string): Promise<ExamResponse> {
    const examData = await this.examRepository.findById(examId);
    if (!examData) {
      throw new NotFoundException(`Exam with ID ${examId} not found.`);
    }

    // Get challenges with order
    const examToProblemsData = await this.examToProblemsRepository.findByExamId(examId);
    const problemIds = examToProblemsData.map((etp: any) => etp.problemId);

    if (problemIds.length === 0) {
      return {
        id: examData.id,
        slug: examData.slug ?? undefined,
        title: examData.title,
        password: '',
        duration: examData.duration,
        startDate: examData.startDate.toISOString(),
        endDate: examData.endDate.toISOString(),
        isVisible: examData.isVisible,
        maxAttempts: examData.maxAttempts,
        challenges: [],
        createdAt: examData.createdAt.toISOString(),
        updatedAt: examData.updatedAt.toISOString(),
      };
    }

    // Fetch problems data via repository
    const problemsData = await this.problemRepository.findByIds(problemIds);

    // Create order map
    const orderMap = new Map(examToProblemsData.map((etp: any) => [etp.problemId, etp.orderIndex]));

    // Return basic challenge info only (no full details to avoid heavy load)
    const basicChallenges = problemsData
      .map((p: any) => ({
        id: p.id,
        title: p.title,
        difficulty: p.difficult,
        visibility: p.visibility,
        orderIndex: orderMap.get(p.id) ?? 0,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }))
      .sort((a: any, b: any) => a.orderIndex - b.orderIndex);

    return {
      id: examData.id,
      slug: examData.slug ?? undefined,
      title: examData.title,
      password: '',
      duration: examData.duration,
      startDate: examData.startDate.toISOString(),
      endDate: examData.endDate.toISOString(),
      isVisible: examData.isVisible,
      maxAttempts: examData.maxAttempts,
      challenges: basicChallenges,
      createdAt: examData.createdAt.toISOString(),
      updatedAt: examData.updatedAt.toISOString(),
    };
  }

  /**
   * Get detailed information about a specific challenge in an exam
   * Call this when user switches to a different challenge to avoid loading all challenges at once
   */
  async getExamChallenge(examId: string, challengeId: string, userId: string): Promise<any> {
    // Verify exam exists and challenge is part of this exam
    const examToProblems = await this.examToProblemsRepository.findByExamId(examId);
    const challengeInExam = examToProblems.find((etp: any) => etp.problemId === challengeId);

    if (!challengeInExam) {
      throw new NotFoundException(`Challenge ${challengeId} not found in exam ${examId}`);
    }

    // Get full challenge details from ChallengeService
    const challengeResponse = await this.challengeService.getChallengeById(challengeId, userId, {
      allowPrivateVisibility: true,
      showAllTestcases: false,
    });

    // Return challenge with orderIndex from exam
    return {
      ...challengeResponse.problem,
      orderIndex: challengeInExam.orderIndex,
      testcases: challengeResponse.testcases,
      solution: challengeResponse.solution,
    };
  }

  async getParticipation(
    examId: string,
    participationId: string,
    userId?: string
  ): Promise<{
    id: string;
    examId: string;
    userId: string;
    startedAt: string;
    endTime?: Date | null;
    status: string;
    currentAnswers?: any;
    expiresAt?: string | null;
    lastSyncedAt?: string | null;
  } | null> {
    const participation = await this.examParticipationRepository.findById(participationId);

    if (!participation) {
      throw new ExamParticipationNotFoundException();
    }

    // Ensure the participation is for the requested exam
    if (participation.examId !== examId) {
      throw new ExamParticipationNotFoundException();
    }

    // If userId provided, ensure ownership
    if (userId && participation.userId !== userId) {
      throw new BaseException('Unauthorized to access this participation', 403, 'UNAUTHORIZED');
    }

    return {
      id: participation.id,
      examId: participation.examId,
      userId: participation.userId,
      startedAt:
        participation.startTime instanceof Date
          ? participation.startTime.toISOString()
          : String(participation.startTime),
      endTime: participation.endTime || null,
      status: participation.status,
      currentAnswers: participation.currentAnswers || {},
      expiresAt:
        participation.expiresAt instanceof Date
          ? participation.expiresAt.toISOString()
          : participation.expiresAt || null,
      lastSyncedAt:
        participation.lastSyncedAt instanceof Date
          ? participation.lastSyncedAt.toISOString()
          : participation.lastSyncedAt || null,
    };
  }

  async getMyParticipation(
    examId: string,
    userId: string
  ): Promise<{
    id: string;
    examId: string;
    userId: string;
    startedAt: string;
    expiresAt?: string | null;
    endTime?: Date | null;
    status: string;
  } | null> {
    // Return active participation only.
    // Completed/submitted attempts must not be resumed in workspace.
    const participation = await this.examParticipationRepository.findInProgressByExamAndUser(
      examId,
      userId
    );

    if (!participation) {
      return null;
    }

    return {
      id: participation.id,
      examId: participation.examId,
      userId: participation.userId,
      startedAt:
        participation.startTime instanceof Date
          ? participation.startTime.toISOString()
          : String(participation.startTime),
      expiresAt:
        participation.expiresAt instanceof Date
          ? participation.expiresAt.toISOString()
          : participation.expiresAt
            ? String(participation.expiresAt)
            : null,
      endTime: participation.endTime || null,
      status: participation.status,
    };
  }

  async getExams(
    limit = 50,
    offset = 0,
    search?: string,
    filterType?: 'all' | 'my' | 'participated',
    userId?: string,
    isVisible?: boolean,
    userRole?: string
  ): Promise<{ data: ExamResponse[]; total: number }> {
    // Build options for repository
    const options: any = {};
    if (search) options.search = search;
    if (isVisible !== undefined) options.isVisible = isVisible;
    const canManageExamList = userRole === 'teacher' || userRole === 'owner' || userRole === 'admin';
    if (!canManageExamList) {
      options.excludeInviteOnly = true;
      options.status = 'published';
    }

    const userParticipations =
      userId && typeof this.examParticipationRepository.findByUserId === 'function'
        ? await this.examParticipationRepository.findByUserId(userId)
        : [];
    const participationSummaryByExamId = new Map<
      string,
      {
        attemptsUsed: number;
        latestParticipationStatus: EExamParticipationStatus | null;
        latestStartedAt: number;
        hasInProgressParticipation: boolean;
        hasCompletedParticipation: boolean;
      }
    >();

    const toTime = (value: unknown): number => {
      if (value instanceof Date) return value.getTime();
      if (typeof value === 'string' || typeof value === 'number') {
        const time = new Date(value).getTime();
        return Number.isFinite(time) ? time : 0;
      }
      return 0;
    };
    const validParticipationStatuses = new Set<string>(
      Object.values(EExamParticipationStatus)
    );

    for (const participation of userParticipations) {
      const examId = (participation as any).examId;
      if (!examId) continue;

      const rawStatus = (participation as any).status;
      const status = validParticipationStatuses.has(rawStatus)
        ? (rawStatus as EExamParticipationStatus)
        : null;
      const startedAt = toTime(
        (participation as any).startTime ?? (participation as any).createdAt
      );
      const summary =
        participationSummaryByExamId.get(examId) ??
        {
          attemptsUsed: 0,
          latestParticipationStatus: null,
          latestStartedAt: Number.NEGATIVE_INFINITY,
          hasInProgressParticipation: false,
          hasCompletedParticipation: false,
        };

      summary.attemptsUsed += 1;
      if (startedAt > summary.latestStartedAt) {
        summary.latestParticipationStatus = status;
        summary.latestStartedAt = startedAt;
      }
      if (status === EExamParticipationStatus.IN_PROGRESS) {
        summary.hasInProgressParticipation = true;
      }
      if (
        status === EExamParticipationStatus.SUBMITTED ||
        status === EExamParticipationStatus.EXPIRED
      ) {
        summary.hasCompletedParticipation = true;
      }
      participationSummaryByExamId.set(examId, summary);
    }

    // If filterType is 'participated' and userId provided, get exam ids participated by user
    if (filterType === 'participated' && userId) {
      const examIds = Array.from(participationSummaryByExamId.keys());
      if (examIds.length === 0) {
        return { data: [], total: 0 };
      }
      options.examIds = examIds;
    }

    // Note: filterType 'my' (exams created by user) requires an author/creator field on exam table,
    // which is not present in the current schema. Keep client-side 'my' behavior for now.

    const { items, total } = await this.examRepository.getExamsPaginated(limit, offset, options);

    const examsData: ExamResponse[] = (items || []).map((examData: any) => {
      const participationSummary = participationSummaryByExamId.get(examData.id);

      return {
        id: examData.id,
        slug: examData.slug ?? undefined,
        title: examData.title,
        password: '',
        duration: examData.duration,
        startDate: examData.startDate.toISOString(),
        endDate: examData.endDate.toISOString(),
        createdBy: examData.createdBy ?? undefined,
        isVisible: examData.isVisible,
        maxAttempts: examData.maxAttempts,
        status: examData.status ?? undefined,
        accessMode: examData.accessMode ?? undefined,
        selfRegistrationApprovalMode: examData.selfRegistrationApprovalMode ?? null,
        selfRegistrationPasswordRequired:
          examData.selfRegistrationPasswordRequired ?? undefined,
        allowExternalCandidates: examData.allowExternalCandidates ?? undefined,
        registrationOpenAt: examData.registrationOpenAt
          ? new Date(examData.registrationOpenAt).toISOString()
          : null,
        registrationCloseAt: examData.registrationCloseAt
          ? new Date(examData.registrationCloseAt).toISOString()
          : null,
        attemptsUsed: participationSummary?.attemptsUsed ?? 0,
        latestParticipationStatus: participationSummary?.latestParticipationStatus ?? null,
        hasInProgressParticipation: participationSummary?.hasInProgressParticipation ?? false,
        hasCompletedParticipation: participationSummary?.hasCompletedParticipation ?? false,
        challenges: [], // Don't fetch full challenge details for list view
        createdAt: examData.createdAt.toISOString(),
        updatedAt: examData.updatedAt.toISOString(),
      };
    });

    return {
      data: examsData,
      total: total || 0,
    };
  }

  async joinExam(
    examId: string,
    userId: string,
    password: string
  ): Promise<{ participationId: string; startTime: Date; expiresAt: Date; duration: number }> {
    // Check exam exists
    const examData = await this.examRepository.findById(examId);
    if (!examData) {
      throw new ExamNotFoundException();
    }

    // Check exam dates
    const now = new Date();
    if (now < examData.startDate) {
      throw new ExamNotStartedException();
    }
    if (now > examData.endDate) {
      throw new ExamEndedException();
    }

    // Check password
    if (!examData.registrationPassword) {
      throw new InvalidPasswordException();
    }

    if (password !== examData.registrationPassword) {
      throw new InvalidPasswordException();
    }

    // Check max attempts
    const previousParticipations = await this.examParticipationRepository.findAllByExamAndUser(
      examId,
      userId
    );

    // Check if user already joined and is IN_PROGRESS
    const existingInProgress = previousParticipations.find((p: any) => p.status === 'IN_PROGRESS');
    if (existingInProgress) {
      throw new ExamAlreadyJoinedException();
    }

    // Check strict max attempts
    if (examData.maxAttempts && previousParticipations.length >= examData.maxAttempts) {
      throw new BaseException(
        'You have reached the maximum number of attempts for this exam',
        400,
        'MAX_ATTEMPTS_REACHED'
      );
    }

    const startTime = new Date();
    const expiresAt = this.calculateEffectiveEndTime(
      startTime,
      examData.duration || 0,
      examData.endDate
    );

    // Create participation with expiresAt
    const [participation] =
      await this.examParticipationRepository.createExamParticipationWithExpiry(
        examId,
        userId,
        startTime,
        expiresAt
      );

    if (!participation) {
      throw new BaseException('Failed to join exam', 500, 'FAILED_TO_JOIN_EXAM');
    }

    return {
      participationId: participation.id,
      startTime: participation.startTime,
      expiresAt: participation.expiresAt || expiresAt,
      duration: examData.duration,
    };
  }

  async submitExam(
    participationId: string,
    userId: string
  ): Promise<{
    participationId: string;
    totalScore: number;
    submittedAt: Date;
  }> {
    // Find participation
    const participation = await this.examParticipationRepository.findById(participationId);
    if (!participation) {
      throw new ExamParticipationNotFoundException();
    }

    // Verify user owns this participation
    if (participation.userId !== userId) {
      throw new BaseException('Unauthorized to submit this exam', 403, 'UNAUTHORIZED');
    }

    // Check if already completed
    if (participation.status === 'SUBMITTED' || participation.status === 'EXPIRED') {
      throw new BaseException('Exam already submitted', 400, 'ALREADY_SUBMITTED');
    }

    // Get exam details
    const examData = await this.examRepository.findById(participation.examId);
    if (!examData) {
      throw new ExamNotFoundException();
    }

    const effectiveEnd = this.calculateEffectiveEndTime(
      participation.startTime,
      examData.duration || 0,
      examData.endDate
    );

    const now = new Date();
    if (now.getTime() > effectiveEnd.getTime()) {
      throw new ExamTimeoutException();
    }

    // Calculate total score from latest submissions for each problem in exam
    const totalScore = await this.calculateExamScore(
      participation.id,
      participation.examId,
      userId
    );

    // Mark participation as completed and set submittedAt, expiresAt, score
    const updated = await this.examParticipationRepository.updateParticipation(participationId, {
      endTime: new Date(),
      status: 'SUBMITTED',
      submittedAt: new Date(),
      expiresAt: new Date(), // Mark as expired since exam is submitted
      score: totalScore,
    });

    if (!updated) {
      throw new BaseException('Failed to submit exam', 500, 'FAILED_TO_SUBMIT');
    }

    return {
      participationId,
      totalScore,
      submittedAt: updated.submittedAt || new Date(),
    };
  }

  async autoSubmitExam(participationId: string): Promise<void> {
    const participation = await this.examParticipationRepository.findById(participationId);
    if (
      !participation ||
      participation.status === 'SUBMITTED' ||
      participation.status === 'EXPIRED'
    ) {
      return;
    }

    // Only auto-submit if the effective end time has passed.
    const examData = await this.examRepository.findById(participation.examId);
    if (!examData) return;

    const effectiveEnd = this.calculateEffectiveEndTime(
      participation.startTime,
      examData.duration || 0,
      examData.endDate
    );

    const now = new Date();
    if (now.getTime() < effectiveEnd.getTime()) {
      // Not yet time to auto-submit
      return;
    }

    // Mark as completed
    await this.examParticipationRepository.updateParticipation(participationId, {
      endTime: effectiveEnd,
      status: 'EXPIRED',
    });
  }

  /**
   * Scan all exams and auto-submit participations whose effective end time has passed.
   * Returns number of participations finalized.
   */
  async finalizeExpiredParticipations(): Promise<number> {
    let finalized = 0;

    // Get exams (visible ones)
    const exams = await this.examRepository.getAllExams();

    const now = new Date();

    for (const ex of exams) {
      const participations = await this.examParticipationRepository.findIncompleteParticipations(
        ex.id
      );

      for (const p of participations) {
        const effectiveEnd = this.calculateEffectiveEndTime(
          p.startTime,
          ex.duration || 0,
          ex.endDate
        );

        if (now.getTime() >= effectiveEnd.getTime()) {
          // auto submit
          try {
            await this.autoSubmitExam(p.id);
            finalized++;
          } catch (err) {
            // log and continue
          }
        }
      }
    }

    return finalized;
  }

  async getExamLeaderboard(
    examId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<
    Array<{
      userId: string;
      user?: { firstname: string; lastname: string; email: string };
      totalScore: number;
      perProblem: Array<{ problemId: string; obtained: number; maxPoints: number }>;
      submittedAt: string;
      rank: number;
    }>
  > {
    // Get exam participations
    const examData = await this.examRepository.findById(examId);
    if (!examData) {
      throw new ExamNotFoundException();
    }

    // Query participations from repository with joined user info to avoid N+1 calls
    const participationRows = await this.examParticipationRepository.getExamLeaderboard(
      examId,
      100000,
      0
    );

    // Filter completed participations and calculate per-problem scores
    const problems = await this.examToProblemsRepository.findByExamId(examId);
    const problemIds = problems.map((pm: any) => pm.problemId);

    const leaderboard = await Promise.all(
      participationRows.map(async (row: any) => {
        // For each problem compute obtained and max points
        const perProblem = await Promise.all(
          problemIds.map(async (problemId: any) => {
            const testcases = await this.testcaseRepository.findByProblemId(problemId);
            const maxPoints = testcases.reduce((s: any, tc: any) => s + (tc.point || 0), 0) || 1;

            // Prefer submission created for this participation
            let obtained = 0;
            const sub = await this.submissionRepository.findLatestByParticipationAndProblem(
              row.participationId as string,
              problemId
            );

            // fallback: if none found, try submissions in participation time window
            if (!sub) {
              const effectiveEnd = this.calculateEffectiveEndTime(
                row.startTime as Date,
                examData.duration || 0,
                examData.endDate
              );

              const latestByTime = await this.submissionRepository.findLatestByUserProblemBetween(
                row.userId,
                problemId,
                row.startTime as Date,
                effectiveEnd
              );
              if (latestByTime) {
                // use that submission
                (sub as any) = latestByTime;
              }
            }

            if (sub && sub.id) {
              const results = await this.resultSubmissionRepository.findBySubmissionId(sub.id);
              const tcMap = new Map(
                results.map((r: any) => [(r as Record<string, any>).testcaseId, r])
              );
              // sum points of passed testcases
              for (const tc of testcases) {
                const r = tcMap.get(tc.id);
                if (r && (r as Record<string, any>).isPassed) {
                  obtained += tc.point || 0;
                }
              }
            }

            return { problemId, obtained, maxPoints };
          })
        );

        const totalScore = perProblem.reduce((s: any, p: any) => s + p.obtained, 0);

        return {
          participationId: row.participationId,
          userId: row.userId,
          userFirstName: row.userFirstName || null,
          userLastName: row.userLastName || null,
          email: row.normalizedEmail || row.email || null,
          fullName: row.fullName || null,
          perProblem,
          totalScore,
          submittedAt: row.submittedAt || new Date(),
        } as any;
      })
    );

    // Sort by totalScore (desc) then by submission time (asc)
    leaderboard.sort((a: any, b: any) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      return (a.submittedAt as Date).getTime() - (b.submittedAt as Date).getTime();
    });

    // Get user info for results
    const results = leaderboard.slice(offset, offset + limit).map((entry: any, index: any) => {
      const displayNameValue = entry.fullName || [entry.userFirstName, entry.userLastName].filter(Boolean).join(' ') || entry.email || '';
      return {
        id: entry.participationId,
        userId: entry.userId,
        user: {
          firstname: displayNameValue,
          lastname: '',
          email: entry.email || '',
        },
        totalScore: entry.totalScore,
        perProblem: entry.perProblem,
        submittedAt: (entry.submittedAt as Date).toISOString(),
        rank: offset + index + 1,
      } as any;
    });

    return results;
  }

  private async calculateExamScore(
    participationId: string,
    examId: string,
    userId: string
  ): Promise<number> {
    // Align scoring with leaderboard: prefer submissions linked to participation; fallback to
    // submissions within participation time window. Award partial points by summing passed
    // testcase points for the selected submission per problem.

    // Get problems in exam
    const examToProblems = await this.examToProblemsRepository.findByExamId(examId);
    const problemIds = examToProblems.map((etp: any) => etp.problemId);

    if (problemIds.length === 0) return 0;

    // Load participation and exam to compute effective end for fallback
    const participation = await this.examParticipationRepository.findById(participationId);
    const examData = await this.examRepository.findById(examId);

    let participationStart: Date | null = null;
    let effectiveEnd: Date | null = null;

    if (participation) participationStart = participation.startTime;
    if (participation && examData) {
      effectiveEnd = this.calculateEffectiveEndTime(
        participation.startTime,
        examData.duration || 0,
        examData.endDate
      );
    }

    let totalScore = 0;

    for (const problemId of problemIds) {
      // Try participation-scoped latest submission first
      let sub = await this.submissionRepository.findLatestByParticipationAndProblem(
        participationId,
        problemId
      );

      // If not found, fallback to submissions by user within participation window
      if (!sub && participationStart && effectiveEnd) {
        const latestByTime = await this.submissionRepository.findLatestByUserProblemBetween(
          userId,
          problemId,
          participationStart,
          effectiveEnd
        );
        if (latestByTime) sub = latestByTime;
      }

      if (sub && sub.id) {
        const results = await this.resultSubmissionRepository.findBySubmissionId(sub.id);
        const testcases = await this.testcaseRepository.findByProblemId(problemId);

        const tcMap = new Map(results.map((r: any) => [(r as Record<string, any>).testcaseId, r]));
        for (const tc of testcases) {
          const r = tcMap.get(tc.id);
          if (r && (r as Record<string, any>).isPassed) {
            totalScore += tc.point || 0;
          }
        }
      }
    }

    return totalScore;
  }

  async getParticipationSubmission(
    examId: string,
    participationId: string,
    userId: string,
    userRole?: string
  ): Promise<{
    id: string;
    userId: string;
    examId: string;
    user?: { firstname: string; lastname: string; email?: string };
    solutions: Array<{
      challengeId: string;
      code: string;
      language: string;
      score: number;
      submittedAt: string;
      results?: Array<{ testCaseId: string; passed: boolean }>;
    }>;
    totalScore: number;
    startedAt: string;
    submittedAt: string;
    duration: number;
  }> {
    // Verify participation exists and belongs to user or is public
    const participation = await this.examParticipationRepository.findById(participationId);
    if (!participation) {
      throw new BaseException('Participation not found', 404, 'NOT_FOUND');
    }

    // Check authorization: only participation owner or teacher can view
    const exam = await this.examRepository.findById(examId);
    if (!exam) {
      throw new ExamNotFoundException();
    }

    // Allow owner (participation user) or teachers to view submissions
    if (participation.userId !== userId && userRole !== 'teacher' && userRole !== 'owner') {
      throw new BaseException('Unauthorized', 403, 'UNAUTHORIZED');
    }

    // Get exam problems
    const problems = await this.examToProblemsRepository.findByExamId(examId);
    const problemIds = problems.map((p: any) => p.problemId);

    // Get user info
    const user = await this.userRepository.findById(participation.userId);

    // Get solutions for each problem
    const solutions = await Promise.all(
      problemIds.map(async (problemId: any) => {
        const problem = await this.problemRepository.findById(problemId);
        const testcases = await this.testcaseRepository.findByProblemId(problemId);

        // Get latest submission for this problem in this participation
        const sub = await this.submissionRepository.findLatestByParticipationAndProblem(
          participationId,
          problemId
        );

        let score = 0;
        let code = '';
        let language = '';
        let submittedAt = new Date().toISOString();
        let results: Array<{ testCaseId: string; passed: boolean }> = [];

        if (sub) {
          code = sub.sourceCode || '';
          language = sub.language || 'unknown';
          submittedAt = (sub.submittedAt || new Date()).toISOString();

          // Calculate score from results
          const resultRecords = await this.resultSubmissionRepository.findBySubmissionId(sub.id);
          const tcMap = new Map(
            resultRecords.map((r: any) => [(r as Record<string, any>).testcaseId, r])
          );

          let passedPoints = 0;
          const maxPoints = testcases.reduce((s: any, tc: any) => s + (tc.point || 0), 0) || 1;
          for (const tc of testcases) {
            const r = tcMap.get(tc.id);
            const isPassed = r?.isPassed || false;
            results.push({ testCaseId: tc.id, passed: isPassed });
            if (isPassed) {
              passedPoints += tc.point || 0;
            }
          }

          // score = Math.round((passedPoints / maxPoints) * 100);
          score = passedPoints;
        }

        return {
          challengeId: problemId,
          challengeTitle: problem?.title || problemId,
          code,
          language,
          score,
          submittedAt,
          results,
        };
      })
    );

    // Calculate total score
    const totalScore = solutions.reduce((s: any, sol: any) => s + sol.score, 0);
    const avgScore = solutions.length > 0 ? Math.round(totalScore / solutions.length) : 0;

    return {
      id: participationId,
      userId: participation.userId,
      examId,
      user: user
        ? {
            firstname: user.firstName || '',
            lastname: user.lastName || '',
            email: user.email || '',
          }
        : undefined,
      solutions,
      totalScore: totalScore,
      startedAt: participation.startTime.toISOString(),
      submittedAt: (participation.endTime || new Date()).toISOString(),
      duration: participation.endTime
        ? Math.round((participation.endTime.getTime() - participation.startTime.getTime()) / 60000)
        : 0,
    };
  }

  // Problem creation and related DB operations were moved to ProblemRepository.
}

/** Creates a fresh ExamService with concrete repositories and default providers. */
export function createExamService(): ExamService {
  return new ExamService({
    examRepository: createExamRepository(),
    examToProblemsRepository: new ExamToProblemsRepository(),
    examParticipationRepository: new ExamParticipationRepository(),
    problemRepository: new ProblemRepository(),
    submissionRepository: new SubmissionRepository(),
    testcaseRepository: new TestcaseRepository(),
    resultSubmissionRepository: new ResultSubmissionRepository(),
    userRepository: new UserRepository(),
    challengeService: createChallengeService(),
    getNotificationPublisher: () => createNotificationService(),
  });
}


