import { FavoriteRepository, FavoriteWithProblem } from '@/repositories/favorite.repository';
import { ProblemRepository } from '@/repositories/problem.repository';
import { TestcaseRepository } from '@/repositories/testcase.repository';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { BaseException } from '@/exceptions/auth.exceptions';
import { NotFoundException } from '@/exceptions/solution.exception';
import { FavoriteResponse, ToggleFavoriteResponse } from '@/validations/favorite.validation';
import { ProblemResponse, ProblemResponseSchema } from '@/validations/problem.validation';

export class FavoriteService {
  private readonly favoriteRepository: FavoriteRepository;
  private readonly problemRepository: ProblemRepository;
  private readonly testcaseRepository: TestcaseRepository;
  private readonly submissionRepository: SubmissionRepository;

  constructor() {
    this.favoriteRepository = new FavoriteRepository();
    this.problemRepository = new ProblemRepository();
    this.testcaseRepository = new TestcaseRepository();
    this.submissionRepository = new SubmissionRepository();
  }

  async addFavorite(userId: string, problemId: string): Promise<FavoriteResponse> {
    const problem = await this.problemRepository.findById(problemId);
    if (!problem) {
      throw new NotFoundException('Challenge not found');
    }

    const existing = await this.favoriteRepository.findByUserAndProblem(userId, problemId);
    if (existing) {
      throw new BaseException('Challenge already bookmarked', 409, 'FAVORITE_EXISTS');
    }

    const favorite = await this.favoriteRepository.addFavorite(userId, problemId);
    const pointsMap = await this.testcaseRepository.sumPointsByProblemIds([problem.id]);

    // Check if user has solved this problem
    const solvedSet = await this.submissionRepository.getAcceptedProblemIdsByUser(userId, [
      problem.id,
    ]);
    const isSolved = solvedSet.has(problem.id);

    return this.mapFavoriteToResponse(favorite, problem, pointsMap[problem.id] ?? 0, isSolved);
  }

  async removeFavorite(userId: string, problemId: string): Promise<void> {
    const existing = await this.favoriteRepository.findByUserAndProblem(userId, problemId);
    if (!existing) {
      throw new NotFoundException('Favorite not found');
    }

    await this.favoriteRepository.removeFavorite(userId, problemId);
  }

  async listUserFavorites(userId: string): Promise<FavoriteResponse[]> {
    const favorites = await this.favoriteRepository.listFavoritesByUser(userId);
    const problemIds = favorites
      .map(row => row.favorite.problemId)
      .filter((id): id is string => Boolean(id));

    const pointsMap = await this.testcaseRepository.sumPointsByProblemIds(problemIds);

    // Check which problems user has solved
    const solvedSet = await this.submissionRepository.getAcceptedProblemIdsByUser(
      userId,
      problemIds
    );

    return favorites.map(row => {
      const problemId = row.favorite.problemId ?? '';
      const isSolved = solvedSet.has(problemId);
      return this.mapFavoriteRowToResponse(row, pointsMap, isSolved);
    });
  }

  async isFavorite(userId: string, problemId: string): Promise<boolean> {
    return this.favoriteRepository.isFavorite(userId, problemId);
  }

  async toggleFavorite(userId: string, problemId: string): Promise<ToggleFavoriteResponse> {
    // Validate problem exists
    const problem = await this.problemRepository.findById(problemId);
    if (!problem) {
      throw new NotFoundException('Challenge not found');
    }

    // Check if already favorited
    const existing = await this.favoriteRepository.findByUserAndProblem(userId, problemId);

    if (existing) {
      // Remove favorite
      const removed = await this.favoriteRepository.removeFavorite(userId, problemId);

      if (!removed) {
        throw new BaseException('Failed to remove favorite', 500, 'REMOVE_FAVORITE_FAILED');
      }
      return {
        isFavorite: false,
        message: 'Challenge removed from bookmarks',
        data: null,
      };
    } else {
      // Add favorite - use repository method directly to avoid duplicate check error
      try {
        const favorite = await this.favoriteRepository.addFavorite(userId, problemId);
        const pointsMap = await this.testcaseRepository.sumPointsByProblemIds([problem.id]);

        // Check if user has solved this problem
        const solvedSet = await this.submissionRepository.getAcceptedProblemIdsByUser(userId, [
          problem.id,
        ]);
        const isSolved = solvedSet.has(problem.id);

        const favoriteResponse = this.mapFavoriteToResponse(
          favorite,
          problem,
          pointsMap[problem.id] ?? 0,
          isSolved
        );
        return {
          isFavorite: true,
          message: 'Challenge bookmarked successfully',
          data: favoriteResponse,
        };
      } catch (error: any) {
        // If favorite was added by another request between check and insert (race condition)
        // Check again and return appropriate response
        const recheck = await this.favoriteRepository.findByUserAndProblem(userId, problemId);
        if (recheck) {
          const pointsMap = await this.testcaseRepository.sumPointsByProblemIds([problem.id]);

          // Check if user has solved this problem
          const solvedSet = await this.submissionRepository.getAcceptedProblemIdsByUser(userId, [
            problem.id,
          ]);
          const isSolved = solvedSet.has(problem.id);

          const favoriteResponse = this.mapFavoriteToResponse(
            recheck,
            problem,
            pointsMap[problem.id] ?? 0,
            isSolved
          );
          return {
            isFavorite: true,
            message: 'Challenge bookmarked successfully',
            data: favoriteResponse,
          };
        }
        // If still not found, rethrow the error
        throw error;
      }
    }
  }

  private mapFavoriteRowToResponse(
    row: FavoriteWithProblem,
    pointsMap: Record<string, number>,
    isSolved: boolean = false
  ): FavoriteResponse {
    const { favorite, problem } = row;
    const problemId = favorite.problemId ?? '';

    return {
      id: favorite.id,
      problemId,
      createdAt: this.formatDate(favorite.createdAt),
      problem: problem
        ? this.mapProblemToResponse(problem, pointsMap[problemId] ?? 0, {
            isSolved,
            isFavorite: true,
          })
        : null,
    };
  }

  private mapFavoriteToResponse(
    favorite: { id: string; problemId: string | null; createdAt: Date | string | null },
    problem: {
      id: string;
      title: string;
      description: string | null;
      difficult: string;
      constraint: string | null;
      tags: string | null;
      lessonId: string | null;
      topicId: string | null;
      createdAt: Date | string | null;
      updatedAt: Date | string | null;
    } | null,
    totalPoints: number,
    isSolved: boolean = false
  ): FavoriteResponse {
    const problemId = favorite.problemId ?? '';
    return {
      id: favorite.id,
      problemId,
      createdAt: this.formatDate(favorite.createdAt),
      problem: problem
        ? this.mapProblemToResponse(problem, totalPoints, { isSolved, isFavorite: true })
        : null,
    };
  }

  private formatDate(value?: Date | string | null): string {
    if (!value) {
      return new Date().toISOString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return new Date(value).toISOString();
  }

  private mapProblemToResponse(
    problem: {
      id: string;
      title: string;
      description: string | null;
      difficult: string;
      constraint: string | null;
      tags: string | null;
      lessonId: string | null;
      topicId: string | null;
      createdAt: Date | string | null;
      updatedAt: Date | string | null;
    },
    totalPoints: number,
    options?: { isSolved?: boolean; isFavorite?: boolean }
  ): ProblemResponse {
    const allowedDifficulties = ['easy', 'medium', 'hard'] as const;
    const difficulty = allowedDifficulties.includes(problem.difficult as any)
      ? (problem.difficult as 'easy' | 'medium' | 'hard')
      : 'easy';

    const response: ProblemResponse = {
      id: problem.id,
      title: problem.title,
      description: problem.description ?? '',
      difficulty,
      constraint: problem.constraint ?? '',
      tags: (problem.tags ?? '')
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean),
      lessonId: problem.lessonId ?? '',
      topicId: problem.topicId ?? '',
      totalPoints,
      isSolved: options?.isSolved ?? false,
      isFavorite: options?.isFavorite ?? false,
      createdAt: this.formatDate(problem.createdAt),
      updatedAt: this.formatDate(problem.updatedAt),
    };

    // Validate and return ProblemResponse
    return ProblemResponseSchema.parse(response);
  }
}
