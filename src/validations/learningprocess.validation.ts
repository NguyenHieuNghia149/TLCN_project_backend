export interface TopicProgress {
  topicId: string;
  topicName: string;
  totalProblems: number;
  solvedProblems: number;
  completionPercentage: number;
  lastSubmittedAt: Date | null;
}

export interface LessonProgress {
  lessonId: string;
  lessonTitle: string;
  topicId: string;
  topicName: string;
  totalLessons: number;
  completedLessons: number;
  completionPercentage: number;
  lastCompletedAt: Date | null;
}

export interface LearningProgressResponse {
  userId: string;
  totalTopics: number;
  totalProblems: number;
  totalSolvedProblems: number;
  overallCompletionPercentage: number;
  topicProgress: TopicProgress[];
  recentTopic?: TopicProgress;
}

export interface LessonProgressResponse {
  userId: string;
  totalLessons: number;
  completedLessons: number;
  completionPercentage: number;
  lessonProgress: LessonProgress[];
  recentLesson?: LessonProgress;
}
