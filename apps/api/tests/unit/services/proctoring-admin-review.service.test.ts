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

  it('returns review data when legacy data-request schema is missing newer columns', async () => {
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
        findByParticipation: jest.fn().mockResolvedValue({
          id: 'summary-1',
          examId: 'exam-1',
          participationId: 'participation-1',
          riskScore: 0,
          riskLevel: 'low',
          eventCountsJson: {},
          velocityJson: {},
          finalFlushStatus: 'completed',
          deterministicSchemaVersion: 'v1',
          computedAt: new Date('2026-06-22T07:00:00.000Z'),
          reviewerDecision: null,
          reviewerId: null,
          reviewerNotes: null,
          reviewedAt: null,
        }),
        updateReviewerDecision: jest.fn(),
      },
      eventRepository: {
        findByParticipation: jest.fn().mockResolvedValue([]),
      },
      consentRepository: {
        findByParticipation: jest.fn().mockResolvedValue(null),
      },
      precheckRepository: {
        findByParticipation: jest.fn().mockResolvedValue(null),
      },
      bypassRepository: {
        findByParticipation: jest.fn().mockResolvedValue([]),
      },
      finalFlushRepository: {
        findByParticipation: jest.fn().mockResolvedValue(null),
      },
      dataRequestRepository: {
        findByParticipation: jest.fn().mockRejectedValue({
          message:
            'Failed query: select ... from "exam_proctoring_data_requests" ...',
          query:
            'select * from "exam_proctoring_data_requests" where "participation_id" = $1',
          cause: {
            code: '42703',
          },
        }),
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

    expect(review.summary).toMatchObject({
      id: 'summary-1',
      examId: 'exam-1',
      participationId: 'participation-1',
    });
    expect(review.evidence.dataRequests).toEqual([]);
    expect(review.timeline.items).toEqual([]);
  });
});
