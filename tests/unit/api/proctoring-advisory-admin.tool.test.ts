import {
  assertSingleRowUpdated,
  buildProbeTelemetryWindow,
  parseCliArgs,
  resolveProbeServerAiConfig,
  requireStringFlag,
} from '../../../apps/api/src/tools/proctoring-advisory-admin';

describe('proctoring advisory admin tool helpers', () => {
  it('parses subcommands and --key=value flags', () => {
    const result = parseCliArgs([
      'node',
      'tool.js',
      'enable-advisory',
      '--exam-id=exam-1',
      '--model-version=iforest-browser-v1.0.0',
      '--dry-run',
    ]);

    expect(result).toEqual({
      command: 'enable-advisory',
      flags: {
        'exam-id': 'exam-1',
        'model-version': 'iforest-browser-v1.0.0',
        'dry-run': true,
      },
    });
  });

  it('requires non-empty string flags', () => {
    expect(() => requireStringFlag({}, 'exam-id')).toThrow('Missing --exam-id=...');
    expect(() => requireStringFlag({ 'exam-id': true }, 'exam-id')).toThrow(
      'Missing --exam-id=...'
    );
  });

  it('builds a valid server-ai probe payload', () => {
    const payload = buildProbeTelemetryWindow(new Date('2026-06-27T14:00:30.000Z'));

    expect(payload).toMatchObject({
      schemaVersion: 1,
      windowId: 'ops-probe-window',
      examId: 'ops-probe-exam',
      participationId: 'ops-probe-participation',
      candidateUserId: 'ops-probe-user',
      consentRecordId: 'ops-probe-consent',
      features: expect.objectContaining({
        windowBlurCount: 1,
        visibilityHiddenMs: 500,
        heartbeatGapMaxMs: 1200,
      }),
    });
    expect(payload).toHaveProperty('startedAt', '2026-06-27T14:00:00.000Z');
    expect(payload).toHaveProperty('endedAt', '2026-06-27T14:00:30.000Z');
  });

  it('prefers the compose server-ai hostname for probe defaults', () => {
    expect(resolveProbeServerAiConfig({})).toEqual({
      serverAiUrl: 'http://server-ai:8001',
      internalToken: '',
    });
  });

  it('prefers explicit flags over environment defaults for probe config', () => {
    expect(
      resolveProbeServerAiConfig(
        {
          'server-ai-url': 'http://override-host:9000/',
          'internal-token': 'token-123',
        },
        {
          SERVER_AI_URL: 'http://env-host:8001',
          SERVER_AI_INTERNAL_TOKEN: 'env-token',
        } as NodeJS.ProcessEnv,
      ),
    ).toEqual({
      serverAiUrl: 'http://override-host:9000',
      internalToken: 'token-123',
    });
  });

  it('rejects advisory updates that touch no rows', () => {
    expect(() => assertSingleRowUpdated(0, 'exam-404')).toThrow(
      'Exam proctoring settings not found for exam exam-404'
    );
  });
});
