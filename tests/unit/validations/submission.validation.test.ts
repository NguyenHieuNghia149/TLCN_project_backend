import {
  GetSubmissionsQuerySchema,
  SubmissionStatusSchema,
} from '@backend/shared/validations/submission.validation';
import { ESubmissionStatus } from '@backend/shared/types';
import { insertSubmissionSchema } from '@backend/shared/db/schema/submission';

describe('submission validation status contract', () => {
  it('accepts canonical lower-case submission statuses', () => {
    const parsed = SubmissionStatusSchema.parse({
      submissionId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      problemId: '33333333-3333-4333-8333-333333333333',
      language: 'python',
      sourceCode: 'print(1)',
      status: 'accepted',
      submittedAt: new Date(),
    });

    expect(parsed.status).toBe(ESubmissionStatus.ACCEPTED);
  });

  it('normalizes historical upper-case query status values', () => {
    const parsed = GetSubmissionsQuerySchema.parse({
      status: 'WRONG_ANSWER',
    });

    expect(parsed.status).toBe(ESubmissionStatus.WRONG_ANSWER);
  });

  it('uses lower-case canonical status values in insert submission schema', () => {
    const parsed = insertSubmissionSchema.parse({
      sourceCode: 'print(1)',
      languageId: '44444444-4444-4444-8444-444444444444',
      userId: '55555555-5555-4555-8555-555555555555',
      problemId: '66666666-6666-4666-8666-666666666666',
    });

    expect(parsed.status).toBe(ESubmissionStatus.PENDING);
    expect(
      insertSubmissionSchema.parse({
        sourceCode: 'print(1)',
        languageId: '44444444-4444-4444-8444-444444444444',
        userId: '55555555-5555-4555-8555-555555555555',
        problemId: '66666666-6666-4666-8666-666666666666',
        status: 'accepted',
      }).status
    ).toBe(ESubmissionStatus.ACCEPTED);
  });
});
