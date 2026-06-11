import express, { Router } from 'express';
import request from 'supertest';

function createPassThroughMiddleware() {
  return (req: unknown, res: unknown, next: () => void) => next();
}

function mockProctoringRouteDependencies() {
  const passThrough = createPassThroughMiddleware();
  jest.doMock('@backend/api/middlewares/auth.middleware', () => ({
    authenticationToken: passThrough,
    optionalAuth: passThrough,
    requireTeacherOrOwner: passThrough,
  }));
  jest.doMock('@backend/api/middlewares/validate.middleware', () => ({
    validate: jest.fn(() => passThrough),
  }));
  jest.doMock('@backend/api/middlewares/ratelimit.middleware', () => ({
    rateLimitMiddleware: jest.fn(() => passThrough),
  }));
}

async function loadProctoringRouters() {
  jest.resetModules();
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockProctoringRouteDependencies();

  const settingsService = {
    getSettingsBySlug: jest.fn(),
    updateSettings: jest.fn(),
  };
  const consentService = {
    acceptConsent: jest.fn(),
    withdrawConsent: jest.fn(),
  };
  const precheckService = {
    createPrecheck: jest.fn(),
  };
  const bypassService = {
    verifyBypassCode: jest.fn(),
    issueBypassCode: jest.fn(),
  };
  const dataRequestService = {
    createDataRequest: jest.fn(),
  };

  jest.doMock('@backend/api/services/proctoring/proctoring-settings.service', () => ({
    createProctoringSettingsService: jest.fn(() => settingsService),
  }));
  jest.doMock('@backend/api/services/proctoring/proctoring-consent.service', () => ({
    createProctoringConsentService: jest.fn(() => consentService),
  }));
  jest.doMock('@backend/api/services/proctoring/proctoring-precheck.service', () => ({
    createProctoringPrecheckService: jest.fn(() => precheckService),
  }));
  jest.doMock('@backend/api/services/proctoring/proctoring-bypass.service', () => ({
    createProctoringBypassService: jest.fn(() => bypassService),
  }));
  jest.doMock('@backend/api/services/proctoring/proctoring-data-request.service', () => ({
    createProctoringDataRequestService: jest.fn(() => dataRequestService),
  }));

  let createProctoringRouter!: () => Router;
  let createAdminProctoringRouter!: () => Router;
  jest.isolateModules(() => {
    ({ createProctoringRouter } = require('@backend/api/routes/proctoring.routes'));
    ({ createAdminProctoringRouter } = require('@backend/api/routes/admin/adminProctoring.routes'));
  });

  return {
    createProctoringRouter,
    createAdminProctoringRouter,
    settingsService,
    consentService,
    precheckService,
    bypassService,
    dataRequestService,
  };
}

describe('proctoring routes', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('wires candidate and admin routes to the proctoring services', async () => {
    const {
      createProctoringRouter,
      createAdminProctoringRouter,
      settingsService,
      consentService,
      precheckService,
      bypassService,
      dataRequestService,
    } = await loadProctoringRouters();

    settingsService.getSettingsBySlug.mockResolvedValue({ id: 'settings-1', enabled: true });
    settingsService.updateSettings.mockResolvedValue({ id: 'settings-1', enabled: true });
    consentService.acceptConsent.mockResolvedValue({ id: 'consent-1' });
    consentService.withdrawConsent.mockResolvedValue({ id: 'consent-1', status: 'withdrawn' });
    precheckService.createPrecheck.mockResolvedValue({ id: 'precheck-1', passed: true });
    bypassService.verifyBypassCode.mockResolvedValue({ bypassCodeId: 'bypass-1' });
    bypassService.issueBypassCode.mockResolvedValue({
      bypassCodeId: 'bypass-1',
      code: 'ABC-123',
    });
    dataRequestService.createDataRequest.mockResolvedValue({ id: 'request-1' });

    const app = express();
    app.use(express.json());
    app.use('/api/exams', createProctoringRouter());
    app.use('/api/admin/exams', createAdminProctoringRouter());

    expect(
      await request(app).get('/api/exams/spring-midterm/proctoring/settings'),
    ).toMatchObject({ status: 200 });
    expect(settingsService.getSettingsBySlug).toHaveBeenCalledWith('spring-midterm', null);

    expect(
      await request(app)
        .post('/api/exams/spring-midterm/proctoring/consent')
        .send({ accepted: true, clientSessionId: 'client-1', acceptedCapabilitiesJson: { camera: true } }),
    ).toMatchObject({ status: 200 });
    expect(consentService.acceptConsent).toHaveBeenCalledWith(
      'spring-midterm',
      undefined,
      expect.objectContaining({ clientSessionId: 'client-1', accepted: true }),
    );

    expect(
      await request(app)
        .post('/api/exams/spring-midterm/proctoring/precheck')
        .send({
          consentRecordId: '33333333-3333-3333-3333-333333333333',
          clientSessionId: 'client-1',
          getUserMediaSupported: true,
          cameraPermissionGranted: true,
          getDisplayMediaSupported: true,
          displaySurface: 'monitor',
          monitorValidated: true,
          fullscreenSupported: true,
          browserSupported: true,
        }),
    ).toMatchObject({ status: 200 });
    expect(precheckService.createPrecheck).toHaveBeenCalledWith(
      'spring-midterm',
      undefined,
      expect.objectContaining({ consentRecordId: '33333333-3333-3333-3333-333333333333' }),
    );

    expect(
      await request(app)
        .post('/api/exams/spring-midterm/proctoring/bypass/verify')
        .send({
          bypassCode: 'ABC-123',
          clientSessionId: 'client-1',
          participationId: '22222222-2222-2222-2222-222222222222',
        }),
    ).toMatchObject({ status: 200 });
    expect(bypassService.verifyBypassCode).toHaveBeenCalledWith(
      'spring-midterm',
      undefined,
      expect.objectContaining({ bypassCode: 'ABC-123' }),
    );

    expect(
      await request(app)
        .post('/api/exams/participations/22222222-2222-2222-2222-222222222222/proctoring/data-requests')
        .send({ requestType: 'delete', statutoryDueAt: '2026-06-12T00:00:00.000Z' }),
    ).toMatchObject({ status: 200 });
    expect(dataRequestService.createDataRequest).toHaveBeenCalledWith(
      '22222222-2222-2222-2222-222222222222',
      undefined,
      expect.objectContaining({ requestType: 'delete' }),
    );

    expect(
      await request(app)
        .post('/api/admin/exams/11111111-1111-1111-1111-111111111111/proctoring/settings')
        .send({ enabled: true, consentNoticeVersion: 'phase-1' }),
    ).toMatchObject({ status: 200 });
    expect(settingsService.updateSettings).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      undefined,
      expect.objectContaining({ enabled: true }),
    );

    expect(
      await request(app)
        .post(
          '/api/admin/exams/11111111-1111-1111-1111-111111111111/participations/22222222-2222-2222-2222-222222222222/proctoring/bypass-codes',
        )
        .send({ clientSessionId: 'client-1', reason: 'manual override' }),
    ).toMatchObject({ status: 200 });
    expect(bypassService.issueBypassCode).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      undefined,
      expect.objectContaining({ clientSessionId: 'client-1' }),
    );
  });
});
