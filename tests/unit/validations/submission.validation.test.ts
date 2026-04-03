import { CreateSubmissionSchema } from '@backend/shared/validations/submission.validation';

describe('submission validation language support', () => {
  const problemId = '11111111-1111-4111-8111-111111111111';

  it('accepts every integrated executable language key', () => {
    expect(
      CreateSubmissionSchema.parse({
        sourceCode: 'code',
        language: 'cpp',
        problemId,
      }).language,
    ).toBe('cpp');

    expect(
      CreateSubmissionSchema.parse({
        sourceCode: 'code',
        language: 'java',
        problemId,
      }).language,
    ).toBe('java');

    expect(
      CreateSubmissionSchema.parse({
        sourceCode: 'code',
        language: 'python',
        problemId,
      }).language,
    ).toBe('python');
  });

  it('rejects unsupported language keys', () => {
    expect(() =>
      CreateSubmissionSchema.parse({
        sourceCode: 'code',
        language: 'go',
        problemId,
      }),
    ).toThrow('Unsupported language. Supported: cpp, java, python');
  });
});
