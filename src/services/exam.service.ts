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
import { db } from '@/database/connection';
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

  async createExam(examData: CreateExamInput): Promise<ExamResponse> {
    const { challenges, ...examFields } = examData;

    const createdExamId = await db.transaction(async tx => {
      // 1. Create the exam
      const examRows = await tx
        .insert(exam)
        .values({
          title: examFields.title,
          password: examFields.password,
          duration: examFields.duration,
          startDate: new Date(examFields.startDate),
          endDate: new Date(examFields.endDate),
          isVisible: examFields.isVisible ?? false,
          maxAttempts: examFields.maxAttempts ?? 1,
        })
        .returning();

      const createdExam = examRows[0];
      if (!createdExam) {
        throw new BaseException('Failed to create exam', 500, 'FAILED_TO_CREATE_EXAM');
      }

      // 2. Process challenges
      const challengeIds: string[] = [];
      const orderMap = new Map<string, number>();

      for (let index = 0; index < challenges.length; index++) {
        const challengeInput = challenges[index];
        if (!challengeInput) continue;

        const orderIndex = challengeInput.orderIndex ?? index;

        if (challengeInput.type === 'existing') {
          // Strategy A: Link existing challenge
          const existingProblem = await tx
            .select()
            .from(problems)
            .where(eq(problems.id, challengeInput.challengeId))
            .limit(1);

          if (existingProblem.length === 0) {
            throw new NotFoundException(
              `Challenge with ID ${challengeInput.challengeId} not found.`
            );
          }

          challengeIds.push(challengeInput.challengeId);
          orderMap.set(challengeInput.challengeId, orderIndex);
        } else if (challengeInput.type === 'new') {
          // Strategy B: Create new challenge
          const newChallengeData: ProblemInput = challengeInput.challenge;

          // Create challenge using the same transactional method as ProblemRepository
          const challengeResult = await this.createChallengeInTransaction(tx, newChallengeData);
          challengeIds.push(challengeResult.problem.id);
          orderMap.set(challengeResult.problem.id, orderIndex);
        }
      }

      // 3. Link challenges to exam
      const examToProblemsInserts = challengeIds.map(problemId => ({
        examId: createdExam.id,
        problemId,
        orderIndex: orderMap.get(problemId) ?? 0,
      }));

      await tx.insert(examToProblems).values(examToProblemsInserts);

      // 4. Return created exam id so we can fetch it after transaction commits
      return createdExam.id;
    });

    // Fetch created exam with challenges for response (outside transaction, after commit)
    return this.getExamById(createdExamId);
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

    // Fetch problems data
    const problemsData = await db.select().from(problems).where(inArray(problems.id, problemIds));

    // Create order map
    const orderMap = new Map(examToProblemsData.map(etp => [etp.problemId, etp.orderIndex]));

    // Return basic challenge info only (no full details to avoid heavy load)
    const basicChallenges = problemsData
      .map(p => ({
        id: p.id,
        title: p.title,
        difficulty: p.difficult,
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
    endTime?: Date | null;
    isCompleted: boolean;
  } | null> {
    const participation = await this.examParticipationRepository.findByExamAndUser(examId, userId);

    if (!participation) return null;

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
    };
  }

  async getExams(
    limit = 50,
    offset = 0,
    search?: string,
    filterType?: 'all' | 'my' | 'participated',
    userId?: string
  ): Promise<{ data: ExamResponse[]; total: number }> {
    // Build options for repository
    const options: any = {};
    if (search) options.search = search;

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
  ): Promise<{ participationId: string; startTime: Date; duration: number }> {
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

    // Create participation
    const [participation] = await this.examParticipationRepository.createExamParticipation(
      examId,
      userId
    );

    if (!participation) {
      throw new BaseException('Failed to join exam', 500, 'FAILED_TO_JOIN_EXAM');
    }

    return {
      participationId: participation.id,
      startTime: participation.startTime,
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

    // Mark participation as completed
    const updated = await this.examParticipationRepository.updateParticipation(participationId, {
      endTime: new Date(),
      isCompleted: true,
    });

    if (!updated) {
      throw new BaseException('Failed to submit exam', 500, 'FAILED_TO_SUBMIT');
    }

    return {
      participationId,
      totalScore,
      submittedAt: updated.endTime || new Date(),
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
      fullName: string;
      email: string;
      totalScore: number;
      submittedAt: string;
      rank: number;
    }>
  > {
    // Get exam participations
    const examData = await this.examRepository.findById(examId);
    if (!examData) {
      throw new ExamNotFoundException();
    }

    const participations = await this.examParticipationRepository.findByExamId(examId);

    // Filter completed participations and calculate per-problem scores
    const problems = await this.examToProblemsRepository.findByExamId(examId);
    const problemIds = problems.map(pm => pm.problemId);

    const leaderboard = await Promise.all(
      participations
        .filter(p => p.isCompleted)
        .map(async p => {
          // For each problem compute obtained and max points
          const perProblem = await Promise.all(
            problemIds.map(async problemId => {
              const testcases = await this.testcaseRepository.findByProblemId(problemId);
              const maxPoints = testcases.reduce((s, tc) => s + (tc.point || 0), 0) || 1;

              // Prefer submission created for this participation
              let obtained = 0;
              const sub = await this.submissionRepository.findLatestByParticipationAndProblem(
                p.id,
                problemId
              );

              // fallback: if none found, try submissions in participation time window
              if (!sub) {
                const startMs = p.startTime.getTime();
                const durationMs = (examData.duration || 0) * 60 * 1000;
                const participationEndByDuration = new Date(startMs + durationMs);
                const examGlobalEnd =
                  examData.endDate instanceof Date ? examData.endDate : new Date(examData.endDate);
                const effectiveEnd =
                  participationEndByDuration.getTime() <= examGlobalEnd.getTime()
                    ? participationEndByDuration
                    : examGlobalEnd;

                const latestByTime = await this.submissionRepository.findLatestByUserProblemBetween(
                  p.userId,
                  problemId,
                  p.startTime,
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
            userId: p.userId,
            perProblem,
            totalScore,
            submittedAt: p.endTime || new Date(),
          };
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
    const results = await Promise.all(
      leaderboard.slice(offset, offset + limit).map(async (entry, index) => {
        const userRepo = new (await import('@/repositories/user.repository')).UserRepository();
        const user = await userRepo.findById(entry.userId);
        return {
          userId: entry.userId,
          fullName: (user?.firstName || '') + ' ' + (user?.lastName || '') || 'Unknown',
          email: user?.email || '',
          totalScore: entry.totalScore,
          perProblem: entry.perProblem,
          submittedAt: entry.submittedAt.toISOString(),
          rank: offset + index + 1,
        };
      })
    );

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

  private async createChallengeInTransaction(tx: any, challengeData: ProblemInput) {
    const { testcases: testcaseInputs, solution, ...problemData } = challengeData;

    // Create problem
    const problemRows = await tx
      .insert(problems)
      .values({
        title: problemData.title,
        description: problemData.description,
        difficult: problemData.difficulty ?? 'easy',
        constraint: problemData.constraint,
        tags: (problemData.tags ?? []).join(','),
        lessonId: problemData.lessonid,
        topicId: problemData.topicid,
        visibility: problemData.visibility ?? ProblemVisibility.PUBLIC,
      } as any)
      .returning();

    const createdProblem = problemRows[0];
    if (!createdProblem) throw new Error('Failed to create problem');

    // Create testcases
    const createdTestcases = await Promise.all(
      (testcaseInputs ?? []).map(tc =>
        tx
          .insert(testcases)
          .values({
            input: tc.input,
            output: tc.output,
            isPublic: tc.isPublic ?? false,
            point: tc.point ?? 0,
            problemId: createdProblem.id,
          } as any)
          .returning()
          .then((rows: any[]) => {
            const row = rows[0];
            if (!row) throw new Error('Failed to create testcase');
            return row;
          })
      )
    );

    // Create solution if provided
    let createdSolution: any = null;
    let createdApproaches: any[] = [];

    if (solution) {
      const sRows = await tx
        .insert(solutions)
        .values({
          title: solution.title,
          description: solution.description,
          videoUrl: solution.videoUrl || null,
          imageUrl: solution.imageUrl || null,
          problemId: createdProblem.id,
          isVisible: solution.isVisible ?? true,
        } as any)
        .returning();

      createdSolution = sRows[0];
      if (!createdSolution) throw new Error('Failed to create solution');

      // Create solution approaches if provided
      if (solution.solutionApproaches && solution.solutionApproaches.length > 0) {
        createdApproaches = await Promise.all(
          solution.solutionApproaches.map(approach =>
            tx
              .insert(solutionApproaches)
              .values({
                title: approach.title,
                description: approach.description,
                sourceCode: approach.sourceCode,
                language: approach.language,
                timeComplexity: approach.timeComplexity || null,
                spaceComplexity: approach.spaceComplexity || null,
                explanation: approach.explanation || null,
                order: approach.order,
                solutionId: createdSolution.id,
                isVisible: approach.isVisible ?? true,
              } as any)
              .returning()
              .then((rows: any[]) => rows[0])
          )
        );
      }
    }

    return {
      problem: createdProblem,
      testcases: createdTestcases,
      solution: createdSolution
        ? { ...createdSolution, solutionApproaches: createdApproaches }
        : null,
    };
  }
}
