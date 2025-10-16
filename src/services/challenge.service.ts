import { NotFoundException } from '@/exceptions/solution.exception';
import { ProblemRepository } from '@/repositories/problem.repository';
import { SolutionRepository } from '@/repositories/solution.repository';
import { TestcaseRepository } from '@/repositories/testcase.repository';
import { TopicRepository } from '@/repositories/topic.repository';
import {
  ProblemEntity,
  SolutionEntity,
  TestcaseEntity,
  updateSolutionVisibilitySchema,
} from '@/database/schema';
import { ChallengeResponse, ProblemInput } from '@/validations/problem.validation';
import { LessonRepository } from '@/repositories/lesson.repository';

export class ChallengeService {
  private topicRepository: TopicRepository;
  private problemRepository: ProblemRepository;
  private testcaseRepository: TestcaseRepository;
  private solutionRepository: SolutionRepository;
  private lessonRepository: LessonRepository;

  constructor() {
    this.topicRepository = new TopicRepository();
    this.problemRepository = new ProblemRepository();
    this.testcaseRepository = new TestcaseRepository();
    this.solutionRepository = new SolutionRepository();
    this.lessonRepository = new LessonRepository();
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
  ): Promise<Pick<SolutionEntity, 'id' | 'isVisible' | 'updatedAt'>> {
    // Validate input using Zod schema
    updateSolutionVisibilitySchema.parse({ isVisible });

    const updatedSolution = await this.solutionRepository.updateVisibility(solutionId, isVisible);

    if (!updatedSolution) {
      throw new NotFoundException(`Solution with ID ${solutionId} not found.`);
    }

    return {
      id: updatedSolution.id,
      isVisible: updatedSolution.isVisible,
      updatedAt: updatedSolution.updatedAt,
    };
  }

  async listProblemsByTopicInfinite(params: {
    topicId: string;
    limit?: number;
    cursor?: { createdAt: string; id: string } | null;
  }): Promise<{
    items: Array<Pick<ProblemEntity, 'id' | 'title' | 'description' | 'difficult' | 'createdAt'>>;
    nextCursor: { createdAt: string; id: string } | null;
  }> {
    const { topicId, limit = 10, cursor } = params;

    const isTopicExisting = await this.topicRepository.findById(topicId);
    if (!isTopicExisting) {
      throw new NotFoundException(`Topic with ID ${topicId} not found.`);
    }

    const { items, nextCursor } = await this.problemRepository.findByTopicWithCursor({
      topicId,
      limit,
      cursor: cursor ? { createdAt: new Date(cursor.createdAt), id: cursor.id } : null,
    });

    return {
      items: items.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        difficult: p.difficult,
        createdAt: p.createdAt,
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

  async listProblemsByTopicAndTags(params: {
    topicId: string;
    tags: string[];
    limit?: number;
    cursor?: { createdAt: string; id: string } | null;
  }): Promise<{
    items: Array<Pick<ProblemEntity, 'id' | 'title' | 'description' | 'difficult' | 'createdAt'>>;
    nextCursor: { createdAt: string; id: string } | null;
  }> {
    const { topicId, tags, limit = 10, cursor } = params;

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

    return {
      items: items.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        difficult: p.difficult,
        createdAt: p.createdAt,
      })),
      nextCursor: nextCursor
        ? { createdAt: nextCursor.createdAt.toISOString(), id: nextCursor.id }
        : null,
    };
  }

  async getChallengeById(challengeId: string): Promise<ChallengeResponse> {
    const problem = await this.problemRepository.findById(challengeId);
    if (!problem) {
      throw new NotFoundException(`Challenge with ID ${challengeId} not found.`);
    }

    const testcases = await this.testcaseRepository.findPublicByProblemId(challengeId);

    const visibleSolution = await this.solutionRepository.findByProblemId(challengeId, true);

    return this.mapToChallengeResponse({
      problem,
      testcases: testcases,
      solution: visibleSolution,
    });
  }

  async updateChallenge(
    challengeId: string,
    updateData: Partial<ProblemInput>
  ): Promise<ChallengeResponse> {
    const existingProblem = await this.problemRepository.findById(challengeId);
    if (!existingProblem) {
      throw new NotFoundException(`Challenge with ID ${challengeId} not found.`);
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

    return this.getChallengeById(challengeId);
  }

  async deleteChallenge(challengeId: string): Promise<void> {
    const existingProblem = await this.problemRepository.findById(challengeId);
    if (!existingProblem) {
      throw new NotFoundException(`Challenge with ID ${challengeId} not found.`);
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
