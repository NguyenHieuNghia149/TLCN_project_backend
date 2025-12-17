import { ExamRepository } from '@/repositories/exam.repository';
import { ExamToProblemsRepository } from '@/repositories/examToProblems.repository';
import { ExamParticipationRepository } from '@/repositories/examParticipation.repository';
import { ProblemRepository } from '@/repositories/problem.repository';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { TestcaseRepository } from '@/repositories/testcase.repository';
import { ResultSubmissionRepository } from '@/repositories/result-submission.repository';
import { CreateExamInput, ExamResponse } from '@/validations/exam.validation';
import { ProblemInput } from '@/validations/problem.validation';
import {
  exam,
  examToProblems,
  problems,
  testcases,
  solutions,
  solutionApproaches,
  examParticipations,
} from '@/database/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { NotFoundException } from '@/exceptions/solution.exception';
import { ProblemVisibility } from '@/enums/problemVisibility.enum';
// Service should not use raw `db` directly; repositories manage DB access and transactions.
import { BaseException } from '@/exceptions/auth.exceptions';
import {
  ExamNotFoundException,
  InvalidPasswordException,
  ExamAlreadyJoinedException,
  ExamTimeoutException,
  ExamParticipationNotFoundException,
  ExamNotStartedException,
  ExamEndedException,
} from '@/exceptions/exam.exceptions';
import { ESubmissionStatus } from '@/enums/submissionStatus.enum';
import { ChallengeService } from './challenge.service';

export class ExamService {
  private examRepository: ExamRepository;
  private examToProblemsRepository: ExamToProblemsRepository;
  private examParticipationRepository: ExamParticipationRepository;
  private problemRepository: ProblemRepository;
  private submissionRepository: SubmissionRepository;
  private testcaseRepository: TestcaseRepository;
  private resultSubmissionRepository: ResultSubmissionRepository;
  private challengeService: ChallengeService;

  constructor() {
    this.examRepository = new ExamRepository();
    this.examToProblemsRepository = new ExamToProblemsRepository();
    this.examParticipationRepository = new ExamParticipationRepository();
    this.problemRepository = new ProblemRepository();
    this.submissionRepository = new SubmissionRepository();
    this.testcaseRepository = new TestcaseRepository();
    this.resultSubmissionRepository = new ResultSubmissionRepository();
    this.challengeService = new ChallengeService();
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
    // Try to find existing IN_PROGRESS participation (only active sessions)
    const existing = await this.examParticipationRepository.findInProgressByExamAndUser(
      examId,
      userId
    );
    if (existing) {
      console.log(
        `[getOrCreateSession] Found existing IN_PROGRESS participation ${existing.id}. Returning it.`
      );
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

    // No IN_PROGRESS participation exists, create a new one
    console.log(
      `[getOrCreateSession] No IN_PROGRESS participation found. Creating new session for user ${userId} in exam ${examId}.`
    );

    const examData = await this.examRepository.findById(examId);
    if (!examData) throw new Error('Exam not found');

    const now = new Date();
    const durationMs = (examData.duration || 0) * 60 * 1000;
    const participationEndByDuration = new Date(now.getTime() + durationMs);
    const examGlobalEnd =
      examData.endDate instanceof Date ? examData.endDate : new Date(examData.endDate);
    const expiresAt =
      participationEndByDuration.getTime() <= examGlobalEnd.getTime()
        ? participationEndByDuration
        : examGlobalEnd;

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
      status: 'IN_PROGRESS',
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
    console.log(
      `[syncSession] Starting sync for session ${sessionId}. ClientTimestamp: ${clientTimestamp}`
    );

    // Merge incoming partial answers with existing currentAnswers to avoid overwriting other problems
    const existing = await this.examParticipationRepository.findById(sessionId);
    if (!existing) {
      console.error(`[syncSession] Session ${sessionId} not found`);
      throw new ExamParticipationNotFoundException();
    }

    const existingAnswers = existing.currentAnswers || {};
    console.log(
      `[syncSession] Existing answers for session: ${Object.keys(existingAnswers).length} problems`
    );

    // If incoming answers include per-problem `updatedAt` timestamps, merge per-key
    // and only accept incoming values that are newer than stored ones. This prevents
    // a stale autosave (e.g., initial/default code sent early) from overwriting a
    // newer saved value on the server.
    const incoming = answers || {};
    const merged: Record<string, any> = { ...existingAnswers };

    const parseTs = (v: unknown) => {
      if (!v) return 0;
      const s = String(v);
      const n = Number(s);
      if (!Number.isNaN(n) && isFinite(n)) return n;
      const p = Date.parse(s);
      if (!Number.isNaN(p)) return p;
      return 0;
    };

    for (const key of Object.keys(incoming)) {
      try {
        const incomingItem = incoming[key] || {};
        const existingItem = existingAnswers[key] || {};
        const incomingUpdated = parseTs(
          incomingItem.updatedAt ||
            incomingItem.updated_at ||
            incomingItem.ts ||
            incomingItem.clientTimestamp
        );
        const existingUpdated = parseTs(
          existingItem.updatedAt ||
            existingItem.updated_at ||
            existingItem.ts ||
            existingItem.clientTimestamp
        );

        // If incoming has no timestamp, accept it (best-effort).
        const accept = incomingUpdated === 0 ? true : incomingUpdated >= existingUpdated;

        if (accept) {
          console.log(
            `[syncSession] Accepting incoming answer for problem ${key} (incoming: ${incomingUpdated}, existing: ${existingUpdated})`
          );
          merged[key] = {
            ...existingItem,
            ...incomingItem,
          };
        } else {
          // keep existing
          console.log(
            `[syncSession] Rejecting incoming answer for problem ${key} (incoming: ${incomingUpdated}, existing: ${existingUpdated})`
          );
          merged[key] = existingItem;
        }
      } catch (err) {
        // On any parse/merge error, be conservative and keep existing value
        console.warn(`[syncSession] Error merging problem ${key}, keeping existing:`, err);
        merged[key] = existingAnswers[key] || incoming[key];
      }
    }

    const updated = await this.examParticipationRepository.updateParticipation(sessionId, {
      currentAnswers: merged,
      lastSyncedAt: now,
    });

    console.log(`[syncSession] ✓ Session ${sessionId} synced. Updated: ${!!updated}`);
    return !!updated;
  }

  async createExam(examData: CreateExamInput): Promise<ExamResponse> {
    const { challenges, ...examFields } = examData;

    // Delegate the full create-with-challenges operation to the repository so
    // the service does not open transactions or interact with the DB directly.
    const createdExamId = await this.examRepository.createExamWithChallenges(
      {
        title: examFields.title,
        password: examFields.password,
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
          const { notificationService } = await import('./notification.service');
          await notificationService.notifyAllUsers(
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
    if (fields.password) dbFields.password = fields.password;
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
          .sort((a, b) => a.order - b.order);

        const currentList = currentLinks
          .map(l => ({
            id: l.problemId,
            order: l.orderIndex,
          }))
          .sort((a, b) => a.order - b.order);

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

      // If we reach here, it's a safe update (only title, password, visibility changed)
      // We can use the simple update method
      await this.examRepository.update(examId, dbFields);
      return this.getExamById(examId);
    }

    // Normal update for exams without participations
    // Prepare challenges structure for repository
    const challengeLinks = (challenges || []).map((ch: any, index: number) => ({
      challengeId: ch.challengeId || ch.id,
      orderIndex: ch.orderIndex ?? index,
    }));

    await this.examRepository.updateExamWithChallenges(examId, dbFields, challengeLinks);

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
    const problemIds = examToProblemsData.map(etp => etp.problemId);

    if (problemIds.length === 0) {
      return {
        id: examData.id,
        title: examData.title,
        password: examData.password,
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
    const orderMap = new Map(examToProblemsData.map(etp => [etp.problemId, etp.orderIndex]));

    // Return basic challenge info only (no full details to avoid heavy load)
    const basicChallenges = problemsData
      .map(p => ({
        id: p.id,
        title: p.title,
        difficulty: p.difficult,
        visibility: p.visibility,
        orderIndex: orderMap.get(p.id) ?? 0,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }))
      .sort((a, b) => a.orderIndex - b.orderIndex);

    return {
      id: examData.id,
      title: examData.title,
      password: examData.password,
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
  async getExamChallenge(examId: string, challengeId: string): Promise<any> {
    // Verify exam exists and challenge is part of this exam
    const examToProblems = await this.examToProblemsRepository.findByExamId(examId);
    const challengeInExam = examToProblems.find(etp => etp.problemId === challengeId);

    if (!challengeInExam) {
      throw new NotFoundException(`Challenge ${challengeId} not found in exam ${examId}`);
    }

    // Get full challenge details from ChallengeService
    const challengeResponse = await this.challengeService.getChallengeById(challengeId);

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
    isCompleted: boolean;
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
      isCompleted: !!participation.isCompleted,
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
    isCompleted: boolean;
    status?: string;
  } | null> {
    // Only return IN_PROGRESS participations to allow resume
    const participation = await this.examParticipationRepository.findInProgressByExamAndUser(
      examId,
      userId
    );

    if (!participation) return null;

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
      isCompleted: !!participation.isCompleted,
      status: participation.status || 'IN_PROGRESS',
    };
  }

  async getExams(
    limit = 50,
    offset = 0,
    search?: string,
    filterType?: 'all' | 'my' | 'participated',
    userId?: string,
    isVisible?: boolean
  ): Promise<{ data: ExamResponse[]; total: number }> {
    // Build options for repository
    const options: any = {};
    if (search) options.search = search;
    if (isVisible !== undefined) options.isVisible = isVisible;

    // If filterType is 'participated' and userId provided, get exam ids participated by user
    if (filterType === 'participated' && userId) {
      const participations = await this.examParticipationRepository.findByUserId(userId);
      const examIds = participations.map(p => p.examId);
      if (examIds.length === 0) {
        return { data: [], total: 0 };
      }
      options.examIds = examIds;
    }

    // Note: filterType 'my' (exams created by user) requires an author/creator field on exam table,
    // which is not present in the current schema. Keep client-side 'my' behavior for now.

    const { items, total } = await this.examRepository.getExamsPaginated(limit, offset, options);

    const examsData: ExamResponse[] = (items || []).map(examData => ({
      id: examData.id,
      title: examData.title,
      password: examData.password,
      duration: examData.duration,
      startDate: examData.startDate.toISOString(),
      endDate: examData.endDate.toISOString(),
      isVisible: examData.isVisible,
      maxAttempts: examData.maxAttempts,
      challenges: [], // Don't fetch full challenge details for list view
      createdAt: examData.createdAt.toISOString(),
      updatedAt: examData.updatedAt.toISOString(),
    }));

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
    if (examData.password !== password) {
      throw new InvalidPasswordException();
    }

    // Check if user already joined
    const existingParticipation = await this.examParticipationRepository.findByExamAndUser(
      examId,
      userId
    );
    if (existingParticipation && !existingParticipation.isCompleted) {
      throw new ExamAlreadyJoinedException();
    }

    // Calculate expiresAt: min(startTime + duration, exam.endDate)
    const startTime = new Date();
    const durationMs = (examData.duration || 0) * 60 * 1000;
    const participationEndByDuration = new Date(startTime.getTime() + durationMs);
    const examGlobalEnd =
      examData.endDate instanceof Date ? examData.endDate : new Date(examData.endDate);
    const expiresAt =
      participationEndByDuration.getTime() <= examGlobalEnd.getTime()
        ? participationEndByDuration
        : examGlobalEnd;

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
    if (participation.isCompleted) {
      throw new BaseException('Exam already submitted', 400, 'ALREADY_SUBMITTED');
    }

    // Get exam details
    const examData = await this.examRepository.findById(participation.examId);
    if (!examData) {
      throw new ExamNotFoundException();
    }

    // Compute effective end time for this participation:
    // A participation cannot continue past either (start + duration) OR the exam global endDate.
    const startMs = participation.startTime.getTime();
    const durationMs = (examData.duration || 0) * 60 * 1000; // duration stored in minutes
    const participationEndByDuration = new Date(startMs + durationMs);
    const examGlobalEnd =
      examData.endDate instanceof Date ? examData.endDate : new Date(examData.endDate);
    const effectiveEnd =
      participationEndByDuration.getTime() <= examGlobalEnd.getTime()
        ? participationEndByDuration
        : examGlobalEnd;

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
      isCompleted: true,
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
    if (!participation || participation.isCompleted) {
      return;
    }

    // Only auto-submit if the effective end time has passed.
    const examData = await this.examRepository.findById(participation.examId);
    if (!examData) return;

    const startMs = participation.startTime.getTime();
    const durationMs = (examData.duration || 0) * 60 * 1000;
    const participationEndByDuration = new Date(startMs + durationMs);
    const examGlobalEnd =
      examData.endDate instanceof Date ? examData.endDate : new Date(examData.endDate);
    const effectiveEnd =
      participationEndByDuration.getTime() <= examGlobalEnd.getTime()
        ? participationEndByDuration
        : examGlobalEnd;

    const now = new Date();
    if (now.getTime() < effectiveEnd.getTime()) {
      // Not yet time to auto-submit
      return;
    }

    // Mark as completed
    await this.examParticipationRepository.updateParticipation(participationId, {
      endTime: effectiveEnd,
      isCompleted: true,
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
        // compute effective end as min(start+duration, exam.endDate)
        const startMs = p.startTime.getTime();
        const durationMs = (ex.duration || 0) * 60 * 1000;
        const participationEndByDuration = new Date(startMs + durationMs);
        const examGlobalEnd = ex.endDate instanceof Date ? ex.endDate : new Date(ex.endDate);
        const effectiveEnd =
          participationEndByDuration.getTime() <= examGlobalEnd.getTime()
            ? participationEndByDuration
            : examGlobalEnd;

        if (now.getTime() >= effectiveEnd.getTime()) {
          // auto submit
          try {
            await this.autoSubmitExam(p.id);
            finalized++;
          } catch (err) {
            // log and continue
            console.error(`Failed to auto-submit participation ${p.id}:`, err);
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
    const problemIds = problems.map(pm => pm.problemId);

    const leaderboard = await Promise.all(
      participationRows.map(async row => {
        // For each problem compute obtained and max points
        const perProblem = await Promise.all(
          problemIds.map(async problemId => {
            const testcases = await this.testcaseRepository.findByProblemId(problemId);
            const maxPoints = testcases.reduce((s, tc) => s + (tc.point || 0), 0) || 1;

            // Prefer submission created for this participation
            let obtained = 0;
            const sub = await this.submissionRepository.findLatestByParticipationAndProblem(
              row.participationId as string,
              problemId
            );

            // fallback: if none found, try submissions in participation time window
            if (!sub) {
              const startMs = (row.startTime as Date).getTime();
              const durationMs = (examData.duration || 0) * 60 * 1000;
              const participationEndByDuration = new Date(startMs + durationMs);
              const examGlobalEnd =
                examData.endDate instanceof Date ? examData.endDate : new Date(examData.endDate);
              const effectiveEnd =
                participationEndByDuration.getTime() <= examGlobalEnd.getTime()
                  ? participationEndByDuration
                  : examGlobalEnd;

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
              const tcMap = new Map(results.map(r => [r.testcaseId, r]));
              // sum points of passed testcases
              for (const tc of testcases) {
                const r = tcMap.get(tc.id);
                if (r && r.isPassed) {
                  obtained += tc.point || 0;
                }
              }
            }

            return { problemId, obtained, maxPoints };
          })
        );

        const totalScore = perProblem.reduce((s, p) => s + p.obtained, 0);

        return {
          participationId: row.participationId,
          userId: row.userId,
          userFirstName: row.userFirstName || null,
          userLastName: row.userLastName || null,
          email: row.email || null,
          perProblem,
          totalScore,
          submittedAt: row.submittedAt || new Date(),
        } as any;
      })
    );

    // Sort by totalScore (desc) then by submission time (asc)
    leaderboard.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      return (a.submittedAt as Date).getTime() - (b.submittedAt as Date).getTime();
    });

    // Get user info for results
    const results = leaderboard.slice(offset, offset + limit).map((entry, index) => {
      const firstNameValue = entry.userFirstName || entry.email || '';
      const lastNameValue = entry.userLastName || '';
      return {
        id: entry.participationId,
        userId: entry.userId,
        user: {
          firstname: firstNameValue,
          lastname: lastNameValue,
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
    const problemIds = examToProblems.map(etp => etp.problemId);

    if (problemIds.length === 0) return 0;

    // Load participation and exam to compute effective end for fallback
    const participation = await this.examParticipationRepository.findById(participationId);
    const examData = await this.examRepository.findById(examId);

    let participationStart: Date | null = null;
    let effectiveEnd: Date | null = null;

    if (participation) participationStart = participation.startTime;
    if (participation && examData) {
      const startMs = participation.startTime.getTime();
      const durationMs = (examData.duration || 0) * 60 * 1000;
      const participationEndByDuration = new Date(startMs + durationMs);
      const examGlobalEnd =
        examData.endDate instanceof Date ? examData.endDate : new Date(examData.endDate);
      effectiveEnd =
        participationEndByDuration.getTime() <= examGlobalEnd.getTime()
          ? participationEndByDuration
          : examGlobalEnd;
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

        const tcMap = new Map(results.map(r => [r.testcaseId, r]));
        for (const tc of testcases) {
          const r = tcMap.get(tc.id);
          if (r && r.isPassed) {
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
    const problemIds = problems.map(p => p.problemId);

    // Get user info
    const userRepo = new (await import('@/repositories/user.repository')).UserRepository();
    const user = await userRepo.findById(participation.userId);
    console.log(user);

    // Get solutions for each problem
    const solutions = await Promise.all(
      problemIds.map(async problemId => {
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
          const tcMap = new Map(resultRecords.map(r => [r.testcaseId, r]));

          let passedPoints = 0;
          const maxPoints = testcases.reduce((s, tc) => s + (tc.point || 0), 0) || 1;
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
          console.log(
            'Score for problem',
            problemId,
            ':',
            score,
            '/',
            maxPoints,
            'points',
            passedPoints
          );
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
    const totalScore = solutions.reduce((s, sol) => s + sol.score, 0);
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
