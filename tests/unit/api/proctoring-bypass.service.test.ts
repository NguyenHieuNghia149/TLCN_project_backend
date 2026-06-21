describe('ProctoringBypassService', () => {
  const loadService = () => require('@backend/api/services/proctoring/proctoring-bypass.service');

  it('stores only a hash when issuing a bypass code', async () => {
    jest.resetModules();
    const bypassRepository = {
      insert: jest.fn().mockResolvedValue({
        id: 'bypass-1',
        status: 'issued',
      }),
      findById: jest.fn(),
      findIssuedForVerification: jest.fn(),
      findUsedGrant: jest.fn(),
      markUsed: jest.fn(),
      incrementFailedAttempts: jest.fn(),
    };
    const { ProctoringBypassService } = loadService();
    const service = new ProctoringBypassService({
      bypassRepository,
      generateCode: () => 'ABC-123',
      hashCode: () => 'hash:ABC-123',
    });

    const result = await service.issueBypassCode('exam-1', 'admin-1', {
      reason: 'manual override',
      clientSessionId: 'client-session-1',
      participationId: 'participation-1',
    });

    expect(bypassRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        codeHash: expect.any(String),
        reason: 'manual override',
      }),
    );
    expect(result).toMatchObject({
      bypassCodeId: 'bypass-1',
      status: 'issued',
    });
    expect(result.code).toBeDefined();
  });

  it('verifies bypass codes against exam, participation, and client session bindings', async () => {
    jest.resetModules();
    const bypassRepository = {
      insert: jest.fn(),
      findById: jest.fn(),
      findIssuedForVerification: jest.fn().mockResolvedValue({
        id: 'bypass-1',
        examId: 'exam-1',
        participationId: 'participation-1',
        entrySessionId: null,
        clientSessionId: 'client-session-1',
        codeHash: 'hash:ABC-123',
        status: 'issued',
        expiresAt: new Date('2026-06-12T00:00:00.000Z'),
      }),
      findUsedGrant: jest.fn().mockResolvedValue({
        id: 'bypass-1',
        status: 'used',
      }),
      markUsed: jest.fn().mockResolvedValue({
        id: 'bypass-1',
        status: 'used',
      }),
      incrementFailedAttempts: jest.fn(),
    };
    const { ProctoringBypassService } = loadService();
    const service = new ProctoringBypassService({
      bypassRepository,
      hashCode: () => 'hash:ABC-123',
    });

    const result = await service.verifyBypassCode('exam-1', 'user-1', {
      bypassCode: 'ABC-123',
      clientSessionId: 'client-session-1',
      participationId: 'participation-1',
    });

    expect(bypassRepository.findIssuedForVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        examId: 'exam-1',
        participationId: 'participation-1',
        clientSessionId: 'client-session-1',
      }),
    );
    expect(bypassRepository.markUsed).toHaveBeenCalledWith(
      'bypass-1',
      expect.objectContaining({ usedByUserId: 'user-1' }),
    );
    expect(result).toMatchObject({
      bypassCodeId: 'bypass-1',
      status: 'used',
    });
  });
});
