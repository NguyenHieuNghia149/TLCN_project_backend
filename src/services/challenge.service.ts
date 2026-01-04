import { NotFoundException } from '@/exceptions/solution.exception';
import { ChallengeHasSubmissionsException } from '@/exceptions/challenge.exceptions';
import { ProblemRepository } from '@/repositories/problem.repository';
import { SolutionRepository } from '@/repositories/solution.repository';
import { TestcaseRepository } from '@/repositories/testcase.repository';
import { TopicRepository } from '@/repositories/topic.repository';
import { updateSolutionVisibilitySchema } from '@/database/schema';
import { ChallengeResponse, ProblemInput, ProblemResponse } from '@/validations/problem.validation';
import { LessonRepository } from '@/repositories/lesson.repository';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { SolutionApproachRepository } from '@/repositories/solutionApproach.repository';
import { SolutionResponse } from '@/validations/solution.validation';
import { FavoriteRepository } from '@/repositories/favorite.repository';
import { TestcaseResponse } from '@/validations/testcase.validation';

export class ChallengeService {
  private topicRepository: TopicRepository;
  private problemRepository: ProblemRepository;
  private testcaseRepository: TestcaseRepository;
  private solutionRepository: SolutionRepository;
  private lessonRepository: LessonRepository;
  private solutionApproachRepository: SolutionApproachRepository;
  private submissionRepository: SubmissionRepository;
  private favoriteRepository: FavoriteRepository;

  constructor() {
    this.topicRepository = new TopicRepository();
    this.problemRepository = new ProblemRepository();
    this.testcaseRepository = new TestcaseRepository();
    this.solutionRepository = new SolutionRepository();
    this.lessonRepository = new LessonRepository();
    this.solutionApproachRepository = new SolutionApproachRepository();
    this.submissionRepository = new SubmissionRepository();
    this.favoriteRepository = new FavoriteRepository();
  }

  async createChallenge(challengeData: ProblemInput): Promise<ChallengeResponse> {
    const { testcases: testcaseInputs, solution, ...problemData } = challengeData;

    // Validate topic and lesson existence
    await this.validateTopicAndLesson(problemData.topicid, problemData.lessonid);

    // Create challenge using repository
    const result = await this.problemRepository.createProblemTransactional(challengeData);

    // Map to response format
    return this.mapToChallengeResponse(result);
  }

  private async validateTopicAndLesson(topicId?: string, lessonId?: string): Promise<void> {
    if (topicId) {
      const topic = await this.topicRepository.findById(topicId);
      if (!topic) {
        throw new NotFoundException(`Topic with ID ${topicId} not found.`);
      }
    }

    if (lessonId) {
      const lesson = await this.lessonRepository.findById(lessonId);
      if (!lesson) {
        throw new NotFoundException(`Lesson with ID ${lessonId} not found.`);
      }
    }
  }

  private mapToChallengeResponse(result: any): ChallengeResponse {
    const { problem, testcases, solution } = result;
    const totalPoints = (testcases || []).reduce((sum: number, tc: any) => {
      const point = typeof tc.point === 'number' ? tc.point : 0;
      return sum + point;
    }, 0);

    // Get isSolved and isFavorite from problem object (passed from getChallengeById)
    // These are explicitly set in getChallengeById, so we can safely read them
    const isSolved = Boolean((problem as any).isSolved ?? false);
    const isFavorite = Boolean((problem as any).isFavorite ?? false);

    return {
      problem: {
        id: problem.id,
        title: problem.title,
        description: problem.description ?? '',
        difficulty: problem.difficult,
        constraint: problem.constraint ?? '',
        tags: (problem.tags ?? '').split(',').filter(Boolean),
        lessonId: problem.lessonId ?? '',
        topicId: problem.topicId ?? '',
        totalPoints,
        isSolved,
        isFavorite,
        // visibility: problem.visibility,
        createdAt: problem.createdAt?.toISOString?.() ?? String(problem.createdAt),
        updatedAt: problem.updatedAt?.toISOString?.() ?? String(problem.updatedAt),
      },
      testcases: testcases.map((tc: any) => ({
        id: tc.id,
        input: tc.input,
        output: tc.output,
        isPublic: tc.isPublic,
        point: tc.point,
        createdAt: tc.createdAt?.toISOString?.() ?? String(tc.createdAt),
        updatedAt: tc.updatedAt?.toISOString?.() ?? String(tc.updatedAt),
      })),
      solution: solution ? this.mapSolutionToResponse(solution) : this.getEmptySolution(),
    };
  }

  private mapSolutionToResponse(solution: any) {
    return {
      id: solution.id,
      title: solution.title,
      description: solution.description ?? '',
      videoUrl: solution.videoUrl ?? '',
      imageUrl: solution.imageUrl ?? '',
      isVisible: solution.isVisible,
      solutionApproaches: (solution.solutionApproaches ?? []).map((ap: any) => ({
        id: ap.id,
        title: ap.title,
        description: ap.description ?? '',
        sourceCode: ap.sourceCode,
        language: ap.language,
        timeComplexity: ap.timeComplexity ?? '',
        spaceComplexity: ap.spaceComplexity ?? '',
        explanation: ap.explanation ?? '',
        order: ap.order,
        createdAt: ap.createdAt?.toISOString?.() ?? String(ap.createdAt),
        updatedAt: ap.updatedAt?.toISOString?.() ?? String(ap.updatedAt),
      })),
      createdAt: solution.createdAt?.toISOString?.() ?? String(solution.createdAt),
      updatedAt: solution.updatedAt?.toISOString?.() ?? String(solution.updatedAt),
    };
  }

  private getEmptySolution() {
    return {
      id: '',
      title: '',
      description: '',
      videoUrl: '',
      imageUrl: '',
      isVisible: true,
      solutionApproaches: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async updateSolutionVisibility(
    solutionId: string,
    isVisible: boolean
  ): Promise<{ id: string; isVisible: boolean; updatedAt: string }> {
    // Validate input using Zod schema
    updateSolutionVisibilitySchema.parse({ isVisible });

    const updatedSolution = await this.solutionRepository.updateVisibility(solutionId, isVisible);

    if (!updatedSolution) {
      throw new NotFoundException(`Solution with ID ${solutionId} not found.`);
    }

    return {
      id: updatedSolution.id,
      isVisible: updatedSolution.isVisible,
      updatedAt:
        updatedSolution.updatedAt instanceof Date
          ? updatedSolution.updatedAt.toISOString()
          : String(updatedSolution.updatedAt),
    };
  }

  async listProblemsByTopicInfinite(params: {
    topicId: string;
    limit?: number;
    cursor?: { createdAt: string; id: string } | null;
    userId?: string;
  }): Promise<{
    items: Array<{
      id: string;
      title: string;
      description: string | null;
      difficulty: string;
      createdAt: Date | string;
      totalPoints: number;
      isSolved: boolean;
      isFavorite: boolean;
    }>;
    nextCursor: { createdAt: string; id: string } | null;
  }> {
    const { topicId, limit = 10, cursor, userId } = params;

    const isTopicExisting = await this.topicRepository.findById(topicId);
    if (!isTopicExisting) {
      throw new NotFoundException(`Topic with ID ${topicId} not found.`);
    }

    const { items, nextCursor } = await this.problemRepository.findByTopicWithCursor({
      topicId,
      limit,
      cursor: cursor ? { createdAt: new Date(cursor.createdAt), id: cursor.id } : null,
    });

    // Batch sum points
    const problemIds = items.map(p => p.id);
    const pointsMap = await this.testcaseRepository.sumPointsByProblemIds(problemIds);

    // Batch solved/favorite map if user provided
    let solvedSet: Set<string> = new Set();
    let favoriteSet: Set<string> = new Set();
    if (userId) {
      solvedSet = await this.submissionRepository.getAcceptedProblemIdsByUser(userId, problemIds);
      favoriteSet = await this.favoriteRepository.getFavoriteProblemIds(userId, problemIds);
    }

    return {
      items: items.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        difficulty: p.difficult,
        createdAt: p.createdAt,
        totalPoints: pointsMap[p.id] ?? 0,
        isSolved: userId ? solvedSet.has(p.id) : false,
        isFavorite: userId ? favoriteSet.has(p.id) : false,
      })),
      nextCursor: nextCursor
        ? { createdAt: nextCursor.createdAt.toISOString(), id: nextCursor.id }
        : null,
    };
  }

  async getTopicTags(topicId: string): Promise<string[]> {
    const isTopicExisting = await this.topicRepository.findById(topicId);
    if (!isTopicExisting) {
      throw new NotFoundException(`Topic with ID ${topicId} not found.`);
    }
    return this.problemRepository.getTagsByTopicId(topicId);
  }

  async getAllTags(): Promise<string[]> {
    return this.problemRepository.getAllTags();
  }

  async listProblemsByTopicAndTags(params: {
    topicId: string;
    tags: string[];
    limit?: number;
    cursor?: { createdAt: string; id: string } | null;
    userId?: string;
  }): Promise<{
    items: Array<{
      id: string;
      title: string;
      description: string | null;
      difficulty: string;
      createdAt: Date | string;
      totalPoints: number;
      isSolved: boolean;
      isFavorite: boolean;
    }>;
    nextCursor: { createdAt: string; id: string } | null;
  }> {
    const { topicId, tags, limit = 10, cursor, userId } = params;

    const isTopicExisting = await this.topicRepository.findById(topicId);
    if (!isTopicExisting) {
      throw new NotFoundException(`Topic with ID ${topicId} not found.`);
    }

    const { items, nextCursor } = await this.problemRepository.findByTopicWithTagsCursor({
      topicId,
      tags,
      limit,
      cursor: cursor ? { createdAt: new Date(cursor.createdAt), id: cursor.id } : null,
    });

    // Batch sum points
    const problemIds = items.map(p => p.id);
    const pointsMap = await this.testcaseRepository.sumPointsByProblemIds(problemIds);

    // Batch solved/favorite map if user provided
    let solvedSet: Set<string> = new Set();
    let favoriteSet: Set<string> = new Set();
    if (userId) {
      solvedSet = await this.submissionRepository.getAcceptedProblemIdsByUser(userId, problemIds);
      favoriteSet = await this.favoriteRepository.getFavoriteProblemIds(userId, problemIds);
    }

    return {
      items: items.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        difficulty: p.difficult,
        createdAt: p.createdAt,
        totalPoints: pointsMap[p.id] ?? 0,
        isSolved: userId ? solvedSet.has(p.id) : false,
        isFavorite: userId ? favoriteSet.has(p.id) : false,
      })),
      nextCursor: nextCursor
        ? { createdAt: nextCursor.createdAt.toISOString(), id: nextCursor.id }
        : null,
    };
  }

  async getAllChallenges(
    page: number,
    limit: number,
    search?: string,
    sortField?: string,
    sortOrder?: 'asc' | 'desc'
  ): Promise<{
    items: Array<{
      id: string;
      title: string;
      description: string | null;
      difficulty: string;
      visibility: boolean;
      topicId: string;
      topicName: string;
      lessonId: string | null;
      createdAt: Date | string;
    }>;
    total: number;
  }> {
    const { data, total } = await this.problemRepository.findAllProblems(
      page,
      limit,
      search,
      sortField,
      sortOrder
    );
    const items = data.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      difficulty: p.difficult,
      visibility: p.visibility,
      topicId: p.topicId,
      topicName: p.topicName,
      lessonId: p.lessonId,
      createdAt: p.createdAt,
    }));
    return { items, total };
  }

  async getChallengeById(
    challengeId: string,
    userId?: string,
    options?: { showAllTestcases?: boolean }
  ): Promise<ChallengeResponse> {
    const problem = await this.problemRepository.findById(challengeId);

    if (!problem) {
      throw new NotFoundException(`Challenge with ID ${challengeId} not found.`);
    }

    // Admin/Teacher can view all testcases, regular users see only public testcases
    const testcases = options?.showAllTestcases
      ? await this.testcaseRepository.findByProblemId(challengeId)
      : await this.testcaseRepository.findPublicByProblemId(challengeId);
    const visibleSolution = await this.fetchVisibleSolutionWithApproaches(challengeId);

    const isSolved = userId
      ? (await this.submissionRepository.getAcceptedProblemIdsByUser(userId, [challengeId])).has(
          challengeId
        )
      : false;

    const isFavorite = userId
      ? await this.favoriteRepository.isFavorite(userId, challengeId)
      : false;

    return this.mapToChallengeResponse({
      problem: { ...problem, isSolved, isFavorite },
      testcases: testcases,
      solution: visibleSolution,
    });
  }

  private async fetchVisibleSolutionWithApproaches(
    problemId: string
  ): Promise<SolutionResponse | null> {
    const solution = await this.solutionRepository.findByProblemId(problemId, true);
    if (!solution) return null;
    const approaches = await this.solutionApproachRepository.findBySolutionId(solution.id);
    return { ...(solution as any), solutionApproaches: approaches } as any;
  }

  async updateChallenge(
    challengeId: string,
    updateData: Partial<ProblemInput>
  ): Promise<ChallengeResponse> {
    const existingProblem = await this.problemRepository.findById(challengeId);
    if (!existingProblem) {
      throw new NotFoundException(`Challenge with ID ${challengeId} not found.`);
    }

    // Check if challenge has any submissions
    const submissions = await this.submissionRepository.findByProblemId(challengeId, {
      page: 1,
      limit: 1,
    });
    if (submissions.data.length > 0) {
      throw new ChallengeHasSubmissionsException();
    }

    // Validate topic and lesson if provided
    if (updateData.topicid || updateData.lessonid) {
      await this.validateTopicAndLesson(updateData.topicid, updateData.lessonid);
    }

    // Convert updateData to match database schema
    const dbUpdateData: any = {
      ...updateData,
      tags: updateData.tags ? updateData.tags.join(',') : undefined,
      topicId: updateData.topicid,
      lessonId: updateData.lessonid,
      difficult: updateData.difficulty,
    };

    // Remove fields that shouldn't be updated directly
    delete dbUpdateData.topicid;
    delete dbUpdateData.lessonid;
    delete dbUpdateData.difficulty;
    delete dbUpdateData.testcases;
    delete dbUpdateData.solution;

    const updatedProblem = await this.problemRepository.update(challengeId, dbUpdateData);
    if (!updatedProblem) {
      throw new NotFoundException(`Failed to update challenge with ID ${challengeId}.`);
    }

    // Handle solution update if provided
    if (updateData.solution) {
      await this.problemRepository.updateSolutionTransactional(challengeId, updateData.solution);
    }

    // Handle testcases update if provided
    if (updateData.testcases) {
      console.log('Updating testcases:', updateData.testcases.length);
      await this.testcaseRepository.updateTestcasesTransactional(challengeId, updateData.testcases);
    } else {
      console.log('No testcases provided in updateData');
    }

    return this.getChallengeById(challengeId, undefined, { showAllTestcases: true });
  }

  async deleteChallenge(challengeId: string): Promise<void> {
    const existingProblem = await this.problemRepository.findById(challengeId);
    if (!existingProblem) {
      throw new NotFoundException(`Challenge with ID ${challengeId} not found.`);
    }

    // Check if challenge has any submissions
    const submissions = await this.submissionRepository.findByProblemId(challengeId, {
      page: 1,
      limit: 1,
    });
    if (submissions.data.length > 0) {
      throw new ChallengeHasSubmissionsException();
    }

    const deletedSolution = await this.solutionRepository.deleteByProblemId(challengeId);
    if (!deletedSolution) {
      throw new NotFoundException(
        `Failed to delete solution for challenge with ID ${challengeId}.`
      );
    }
    const deletedTestcases = await this.testcaseRepository.deleteByProblemId(challengeId);
    if (!deletedTestcases) {
      throw new NotFoundException(
        `Failed to delete testcases for challenge with ID ${challengeId}.`
      );
    }

    const deleted = await this.problemRepository.delete(challengeId);
    if (!deleted) {
      throw new NotFoundException(`Failed to delete challenge with ID ${challengeId}.`);
    }
  }
}
