describe('proctoring validation schemas', () => {
  const loadSchemas = () => require('@backend/shared/validations/proctoring.validation');

  it('validates params and consent request bodies', () => {
    const {
      ProctoringSlugParamsSchema,
      ProctoringExamIdParamsSchema,
      ProctoringParticipationIdParamsSchema,
      CreateProctoringConsentSchema,
      CreateProctoringPrecheckSchema,
      VerifyProctoringBypassSchema,
      CreateProctoringDataRequestSchema,
      UpdateProctoringSettingsSchema,
      IssueProctoringBypassCodeSchema,
    } = loadSchemas();

    expect(ProctoringSlugParamsSchema.parse({ slug: 'spring-midterm' })).toEqual({
      slug: 'spring-midterm',
    });
    expect(ProctoringExamIdParamsSchema.parse({ examId: '11111111-1111-1111-8111-111111111111' })).toEqual({
      examId: '11111111-1111-1111-8111-111111111111',
    });
    expect(
      ProctoringParticipationIdParamsSchema.parse({
        participationId: '22222222-2222-2222-8222-222222222222',
      }),
    ).toEqual({ participationId: '22222222-2222-2222-8222-222222222222' });

    expect(
      CreateProctoringConsentSchema.parse({
        accepted: true,
        clientSessionId: 'client-session-1',
        acceptedCapabilitiesJson: {
          camera: true,
        },
      }),
    ).toMatchObject({
      accepted: true,
      clientSessionId: 'client-session-1',
    });

    expect(
      CreateProctoringPrecheckSchema.parse({
        consentRecordId: '33333333-3333-3333-8333-333333333333',
        clientSessionId: 'client-session-1',
        browserName: 'Chromium',
        browserVersion: '126',
        osName: 'Windows',
        getUserMediaSupported: true,
        cameraPermissionGranted: true,
        getDisplayMediaSupported: true,
        displaySurface: 'monitor',
        monitorValidated: true,
        fullscreenSupported: true,
        browserSupported: true,
      }),
    ).toMatchObject({
      displaySurface: 'monitor',
      browserSupported: true,
    });

    expect(
      VerifyProctoringBypassSchema.parse({
        bypassCode: 'ABC-123',
        clientSessionId: 'client-session-1',
        participationId: '22222222-2222-2222-8222-222222222222',
      }),
    ).toMatchObject({
      bypassCode: 'ABC-123',
      clientSessionId: 'client-session-1',
    });

    expect(
      CreateProctoringDataRequestSchema.parse({
        requestType: 'delete',
        statutoryDueAt: '2026-06-12T00:00:00.000Z',
      }),
    ).toMatchObject({
      requestType: 'delete',
    });

    expect(
      UpdateProctoringSettingsSchema.parse({
        enabled: true,
        precheckValiditySeconds: 300,
      }),
    ).toMatchObject({
      enabled: true,
      precheckValiditySeconds: 300,
    });

    expect(
      IssueProctoringBypassCodeSchema.parse({
        clientSessionId: 'client-session-1',
        reason: 'manual override',
      }),
    ).toMatchObject({
      reason: 'manual override',
    });
  });

  it('rejects invalid precheck and bypass verification payloads', () => {
    const { CreateProctoringPrecheckSchema, VerifyProctoringBypassSchema } = loadSchemas();

    expect(() =>
      CreateProctoringPrecheckSchema.parse({
        consentRecordId: 'not-a-uuid',
        clientSessionId: 'client-session-1',
        getUserMediaSupported: true,
        cameraPermissionGranted: true,
        getDisplayMediaSupported: true,
        fullscreenSupported: true,
        browserSupported: true,
      }),
    ).toThrow();

    expect(() =>
      VerifyProctoringBypassSchema.parse({
        bypassCode: 'ABC-123',
        clientSessionId: 'client-session-1',
      }),
    ).toThrow();
  });
});
