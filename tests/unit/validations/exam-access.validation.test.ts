import {
  CreateAdminExamSchema,
  ExamSessionSyncSchema,
} from '@backend/shared/validations/exam-access.validation';

describe('exam access validation', () => {
  const basePayload = {
    title: 'Spring Midterm',
    slug: 'spring-midterm',
    duration: 90,
    startDate: '2026-05-01T09:00:00.000Z',
    endDate: '2026-05-01T12:00:00.000Z',
    isVisible: true,
    maxAttempts: 1,
    accessMode: 'open_registration' as const,
    selfRegistrationApprovalMode: 'auto' as const,
    selfRegistrationPasswordRequired: true,
    allowExternalCandidates: true,
    registrationOpenAt: '2026-04-29T09:00:00.000Z',
    registrationCloseAt: '2026-05-01T11:00:00.000Z',
    challenges: [{ type: 'existing' as const, challengeId: '11111111-1111-4111-8111-111111111111' }],
  };

  it('accepts a valid open registration exam config', () => {
    expect(CreateAdminExamSchema.parse(basePayload)).toMatchObject({
      title: 'Spring Midterm',
      slug: 'spring-midterm',
      accessMode: 'open_registration',
      selfRegistrationApprovalMode: 'auto',
      selfRegistrationPasswordRequired: true,
    });
  });

  it('rejects invite_only exams that still configure self-registration approval', () => {
    expect(() =>
      CreateAdminExamSchema.parse({
        ...basePayload,
        accessMode: 'invite_only',
        selfRegistrationApprovalMode: 'manual',
        selfRegistrationPasswordRequired: false,
      }),
    ).toThrow('Invite-only exams cannot configure self-registration approval.');
  });

  it('rejects registration windows that close before they open', () => {
    expect(() =>
      CreateAdminExamSchema.parse({
        ...basePayload,
        registrationOpenAt: '2026-04-30T09:00:00.000Z',
        registrationCloseAt: '2026-04-30T08:59:00.000Z',
      }),
    ).toThrow('Registration close time must be after registration open time.');
  });

  it('rejects registration windows that open after the exam starts', () => {
    expect(() =>
      CreateAdminExamSchema.parse({
        ...basePayload,
        registrationOpenAt: '2026-05-01T09:30:00.000Z',
      }),
    ).toThrow('Registration open time must be before the exam start time.');
  });

  it('accepts the canonical sync payload with participationId', () => {
    expect(
      ExamSessionSyncSchema.parse({
        participationId: '11111111-1111-4111-8111-111111111111',
        answers: {
          challengeA: { code: 'print(1)' },
        },
      }),
    ).toMatchObject({
      participationId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('accepts the legacy sync payload with sessionId during rollout', () => {
    expect(
      ExamSessionSyncSchema.parse({
        sessionId: 'legacy-session-1',
        answers: {
          challengeA: { code: 'print(1)' },
        },
        clientTimestamp: '2000-01-01T00:00:00.000Z',
      }),
    ).toMatchObject({
      sessionId: 'legacy-session-1',
    });
  });
});
