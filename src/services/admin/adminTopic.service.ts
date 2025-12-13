import { TopicRepository } from '@/repositories/topic.repository';
import { NotFoundException } from '@/exceptions/solution.exception';
import { CreateTopicInput, UpdateTopicInput, TopicResponse } from '@/validations/topic.validation';

export interface TopicFilters {
  search?: string;
  topicName?: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TopicStats {
  id: string;
  topicName: string;
  totalLessons: number;
  totalProblems: number;
  createdAt: Date;
  updatedAt: Date;
}

export class AdminTopicService {
  private repository: TopicRepository;

  constructor() {
    this.repository = new TopicRepository();
  }

  async listTopics(
    filters: TopicFilters,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<TopicResponse>> {
    const { search, topicName } = filters;
    const { page, limit, sortBy, sortOrder } = pagination;

    // Get all topics
    const allTopics = await this.repository.getAllTopics();

    // Apply filters
    let filtered = allTopics;
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(t => t.topicName.toLowerCase().includes(searchLower));
    }
    if (topicName) {
      const topicNameLower = topicName.toLowerCase();
      filtered = filtered.filter(t => t.topicName.toLowerCase().includes(topicNameLower));
    }

    // Sort
    if (sortBy === 'topicName') {
      filtered.sort((a, b) => {
        const compareResult = a.topicName.localeCompare(b.topicName);
        return sortOrder === 'asc' ? compareResult : -compareResult;
      });
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const data = filtered.slice(startIndex, startIndex + limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getTopicById(id: string): Promise<TopicResponse> {
    const topic = await this.repository.findById(id);
    if (!topic) {
      throw new NotFoundException(`Topic with ID ${id} not found`);
    }
    return {
      id: topic.id,
      topicName: topic.topicName,
    };
  }

  async createTopic(topicData: CreateTopicInput): Promise<TopicResponse> {
    try {
      const topic = await this.repository.createTopic({ topicName: topicData.topicName });
      return {
        id: topic.id,
        topicName: topic.topicName,
      };
    } catch (error) {
      throw error;
    }
  }

  async updateTopic(id: string, topicData: Partial<UpdateTopicInput>): Promise<TopicResponse> {
    try {
      const topic = await this.repository.findById(id);
      if (!topic) {
        throw new NotFoundException(`Topic with ID ${id} not found`);
      }

      // Check if new topic name already exists (if being updated)
      if (topicData.topicName && topicData.topicName !== topic.topicName) {
        const existingTopic = await this.repository.findByName(topicData.topicName);
        if (existingTopic) {
          throw new Error('Topic name already exists');
        }
      }

      const updatedTopic = await this.repository.update(id, {
        topicName: topicData.topicName || topic.topicName,
      });

      if (!updatedTopic) {
        throw new NotFoundException(`Topic with ID ${id} not found`);
      }

      return {
        id: updatedTopic.id,
        topicName: updatedTopic.topicName,
      };
    } catch (error) {
      throw error;
    }
  }

  async deleteTopic(id: string): Promise<void> {
    try {
      const topic = await this.repository.findById(id);
      if (!topic) {
        throw new NotFoundException(`Topic with ID ${id} not found`);
      }

      await this.repository.deleteTopicWithCascade(id);
    } catch (error) {
      throw error;
    }
  }

  async getTopicStats(id: string): Promise<TopicStats> {
    try {
      const topic = await this.repository.findById(id);
      if (!topic) {
        throw new NotFoundException(`Topic with ID ${id} not found`);
      }

      const stats = await this.repository.getTopicStats(id);

      return {
        id: topic.id,
        topicName: topic.topicName,
        totalLessons: stats.totalLessons,
        totalProblems: stats.totalProblems,
        createdAt: topic.createdAt,
        updatedAt: topic.updatedAt,
      };
    } catch (error) {
      throw error;
    }
  }
}
