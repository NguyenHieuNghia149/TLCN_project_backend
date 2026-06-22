import { ProctoringAdminReviewService } from '../../../../../apps/api/src/services/proctoring/proctoring-admin-review.service';

describe('ProctoringAdminReviewService access control', () => {
  it('allows teacher review access for exam participations even when the teacher is not the exam creator', async () => {
    const service = new ProctoringAdminReviewService({
      examRepository: {
        findById: jest.fn().mockResolvedValue({
          id: 'exam-1',
          createdBy: 'owner-1',
        }),
      },
      participationRepository: {
        findById: jest.fn().mockResolvedValue({
          id: 'participation-1',
          examId: 'exam-1',
        }),
      },
      summaryRepository: {
        findByParticipation: jest.fn().mockResolvedValue(null),
        updateReviewerDecision: jest.fn(),
      },
      eventRepository: {
        findByParticipation: jest.fn().mockResolvedValue([]),
      },
      consentRepository: {
        findByParticipation: jest.fn().mockResolvedValue([]),
      },
      precheckRepository: {
        findByParticipation: jest.fn().mockResolvedValue([]),
      },
      bypassRepository: {
        findByParticipation: jest.fn().mockResolvedValue([]),
      },
      finalFlushRepository: {
        findByParticipation: jest.fn().mockResolvedValue([]),
      },
      dataRequestRepository: {
        findByParticipation: jest.fn().mockResolvedValue([]),
      },
      reviewLabelRepository: {
        findByParticipation: jest.fn().mockResolvedValue([]),
        upsertReviewerLabel: jest.fn(),
      },
      settingsRepository: {
        findByExamId: jest.fn().mockResolvedValue(null),
      },
      anomalyResultRepository: {
        findLatestByParticipation: jest.fn().mockResolvedValue([]),
      },
      llmSummaryRepository: {
        findLatestByParticipation: jest.fn().mockResolvedValue(null),
      },
      evaluationReportRepository: {
        findLatestForModel: jest.fn().mockResolvedValue(null),
      },
    });

    const review = await service.getReview('exam-1', 'participation-1', {
      userId: 'teacher-2',
      role: 'teacher',
    });

    expect(review).toMatchObject({
      summary: null,
      timeline: {
        items: [],
        total: 0,
      },
      aiAdvisory: {
        visible: false,
        status: 'hidden_shadow_mode',
        windows: [],
      },
    });
  });
});
