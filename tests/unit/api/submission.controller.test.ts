import { SubmissionController } from '@backend/api/controllers/submission.controller';
import type { ISubmissionEventStream } from '@backend/api/services/sse.service';

/** Builds a minimal Express-like response object for SSE controller tests. */
function createMockResponse() {
  return {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
  };
}

describe('SubmissionController SSE stream provider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('does not resolve the SSE provider during controller construction', () => {
    const getSubmissionEventStream = jest.fn();

    new SubmissionController({} as any, getSubmissionEventStream);

    expect(getSubmissionEventStream).not.toHaveBeenCalled();
  });

  it('subscribes lazily, emits heartbeat, and cleans up on terminal updates', async () => {
    const submissionEventStream: ISubmissionEventStream = {
      on: jest.fn().mockReturnThis(),
      removeListener: jest.fn().mockReturnThis(),
    };
    const getSubmissionEventStream = jest.fn(() => submissionEventStream);
    const controller = new SubmissionController({} as any, getSubmissionEventStream);
    const response = createMockResponse();
    const closeHandlers: Array<() => void> = [];
    const request = {
      params: { submissionId: 'submission-1' },
      on: jest.fn((event: string, handler: () => void) => {
        if (event === 'close') {
          closeHandlers.push(handler);
        }
      }),
    };

    await controller.streamSubmissionStatus(request as any, response as any, jest.fn());

    expect(getSubmissionEventStream).toHaveBeenCalledTimes(1);
    expect(submissionEventStream.on).toHaveBeenCalledWith(
      'submission_submission-1',
      expect.any(Function)
    );

    jest.advanceTimersByTime(15000);
    expect(response.write).toHaveBeenCalledWith(':\n\n');

    const onUpdate = (submissionEventStream.on as jest.Mock).mock.calls[0][1];
    onUpdate({
      status: 'ACCEPTED',
      results: [{ actual_output: 'x'.repeat(2050) }],
    });

    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('[TRUNCATED]'));
    expect(submissionEventStream.removeListener).toHaveBeenCalledWith(
      'submission_submission-1',
      onUpdate
    );
    expect(response.end).toHaveBeenCalledTimes(1);
    expect(closeHandlers).toHaveLength(1);
  });

  it('removes the listener when the request closes before a terminal update', async () => {
    const submissionEventStream: ISubmissionEventStream = {
      on: jest.fn().mockReturnThis(),
      removeListener: jest.fn().mockReturnThis(),
    };
    const controller = new SubmissionController({} as any, () => submissionEventStream);
    const response = createMockResponse();
    const closeHandlers: Array<() => void> = [];
    const request = {
      params: { submissionId: 'submission-2' },
      on: jest.fn((event: string, handler: () => void) => {
        if (event === 'close') {
          closeHandlers.push(handler);
        }
      }),
    };

    await controller.streamSubmissionStatus(request as any, response as any, jest.fn());

    const onUpdate = (submissionEventStream.on as jest.Mock).mock.calls[0][1];
    expect(closeHandlers).toHaveLength(1);
    closeHandlers[0]!();

    expect(submissionEventStream.removeListener).toHaveBeenCalledWith(
      'submission_submission-2',
      onUpdate
    );
  });
});
