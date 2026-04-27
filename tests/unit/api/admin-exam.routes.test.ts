import express, { Router } from 'express';
import request from 'supertest';

import { JWTUtils } from '@backend/shared/utils';

function createAccessToken(userId: string, role: 'user' | 'teacher' | 'owner') {
  return JWTUtils.generateAccessToken(userId, `${userId}@example.com`, role);
}

async function createAdminExamApp(examAccessService: Record<string, unknown>) {
  jest.resetModules();
  jest.clearAllMocks();

  jest.doMock('@backend/api/services/exam-access.service', () => ({
    createExamAccessService: jest.fn(() => examAccessService),
  }));
  jest.doMock('@backend/api/middlewares/ratelimit.middleware', () => ({
    rateLimitMiddleware: jest.fn(() => (req: unknown, res: unknown, next: () => void) => next()),
  }));

  let createAdminExamRouter!: () => Router;
  let errorMiddleware!: typeof import('@backend/api/middlewares/error.middleware').errorMiddleware;
  jest.isolateModules(() => {
    ({ createAdminExamRouter } = require('@backend/api/routes/admin/adminExam.routes'));
    ({ errorMiddleware } = require('@backend/api/middlewares/error.middleware'));
  });

  const app = express();
  app.use(express.json());
  app.use('/api/admin/exams', createAdminExamRouter());
  app.use(errorMiddleware);

  return { app, examAccessService };
}

describe('Admin exam HTTP routes', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('allows a teacher token to create an exam and returns 201', async () => {
    const createAdminExam = jest.fn().mockResolvedValue({
      id: 'exam-1',
      slug: 'spring-midterm',
      status: 'draft',
    });
    const { app } = await createAdminExamApp({
      listAdminExams: jest.fn(),
      getAdminExamById: jest.fn(),
      createAdminExam,
      updateAdminExam: jest.fn(),
      publishExam: jest.fn(),
      listAdminExamParticipants: jest.fn(),
      addAdminExamParticipants: jest.fn(),
      approveParticipant: jest.fn(),
      rejectParticipant: jest.fn(),
      revokeParticipant: jest.fn(),
      resendInvite: jest.fn(),
      bindParticipantAccount: jest.fn(),
      mergeParticipants: jest.fn(),
    });

    const response = await request(app)
      .post('/api/admin/exams')
      .set('Authorization', `Bearer ${createAccessToken('teacher-1', 'teacher')}`)
      .send({
        title: 'Spring Midterm',
        slug: 'spring-midterm',
        duration: 90,
        startDate: '2099-05-01T09:00:00.000Z',
        endDate: '2099-05-01T12:00:00.000Z',
        accessMode: 'open_registration',
        selfRegistrationApprovalMode: 'auto',
        selfRegistrationPasswordRequired: false,
        allowExternalCandidates: true,
        challenges: [
          {
            type: 'existing',
            challengeId: '11111111-1111-4111-8111-111111111111',
            orderIndex: 0,
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(createAdminExam).toHaveBeenCalledWith(
      'teacher-1',
      expect.objectContaining({
        title: 'Spring Midterm',
        slug: 'spring-midterm',
      }),
    );
    expect(response.body).toMatchObject({
      id: 'exam-1',
      status: 'draft',
    });
  });

  it('blocks a normal user token from admin exam routes', async () => {
    const { app } = await createAdminExamApp({
      listAdminExams: jest.fn(),
      getAdminExamById: jest.fn(),
      createAdminExam: jest.fn(),
      updateAdminExam: jest.fn(),
      publishExam: jest.fn(),
      listAdminExamParticipants: jest.fn(),
      addAdminExamParticipants: jest.fn(),
      approveParticipant: jest.fn(),
      rejectParticipant: jest.fn(),
      revokeParticipant: jest.fn(),
      resendInvite: jest.fn(),
      bindParticipantAccount: jest.fn(),
      mergeParticipants: jest.fn(),
    });

    const response = await request(app)
      .get('/api/admin/exams')
      .set('Authorization', `Bearer ${createAccessToken('user-1', 'user')}`);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      message: 'Insufficient permissions',
      code: 'INSUFFICIENT_PERMISSIONS',
    });
  });

  it('allows an owner token to list exams', async () => {
    const listAdminExams = jest.fn().mockResolvedValue({
      data: [{ id: 'exam-1' }],
      total: 1,
    });
    const { app } = await createAdminExamApp({
      listAdminExams,
      getAdminExamById: jest.fn(),
      createAdminExam: jest.fn(),
      updateAdminExam: jest.fn(),
      publishExam: jest.fn(),
      listAdminExamParticipants: jest.fn(),
      addAdminExamParticipants: jest.fn(),
      approveParticipant: jest.fn(),
      rejectParticipant: jest.fn(),
      revokeParticipant: jest.fn(),
      resendInvite: jest.fn(),
      bindParticipantAccount: jest.fn(),
      mergeParticipants: jest.fn(),
    });

    const response = await request(app)
      .get('/api/admin/exams?limit=5&offset=10')
      .set('Authorization', `Bearer ${createAccessToken('owner-1', 'owner')}`);

    expect(response.status).toBe(200);
    expect(listAdminExams).toHaveBeenCalledWith({
      limit: 5,
      offset: 10,
      createdBy: undefined,
      search: undefined,
    });
    expect(response.body).toEqual({
      data: [{ id: 'exam-1' }],
      total: 1,
    });
  });

  it('wraps participant list responses under data', async () => {
    const listAdminExamParticipants = jest.fn().mockResolvedValue([
      { id: 'participant-1', approvalStatus: 'approved' },
    ]);
    const { app } = await createAdminExamApp({
      listAdminExams: jest.fn(),
      getAdminExamById: jest.fn(),
      createAdminExam: jest.fn(),
      updateAdminExam: jest.fn(),
      publishExam: jest.fn(),
      listAdminExamParticipants,
      addAdminExamParticipants: jest.fn(),
      approveParticipant: jest.fn(),
      rejectParticipant: jest.fn(),
      revokeParticipant: jest.fn(),
      resendInvite: jest.fn(),
      bindParticipantAccount: jest.fn(),
      mergeParticipants: jest.fn(),
    });

    const response = await request(app)
      .get('/api/admin/exams/11111111-1111-4111-8111-111111111111/participants')
      .set('Authorization', `Bearer ${createAccessToken('teacher-1', 'teacher')}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [{ id: 'participant-1', approvalStatus: 'approved' }],
    });
  });

  it('returns 201 and a data envelope when participants are added', async () => {
    const addAdminExamParticipants = jest.fn().mockResolvedValue([
      { id: 'participant-1', approvalStatus: 'approved' },
    ]);
    const { app } = await createAdminExamApp({
      listAdminExams: jest.fn(),
      getAdminExamById: jest.fn(),
      createAdminExam: jest.fn(),
      updateAdminExam: jest.fn(),
      publishExam: jest.fn(),
      listAdminExamParticipants: jest.fn(),
      addAdminExamParticipants,
      approveParticipant: jest.fn(),
      rejectParticipant: jest.fn(),
      revokeParticipant: jest.fn(),
      resendInvite: jest.fn(),
      bindParticipantAccount: jest.fn(),
      mergeParticipants: jest.fn(),
    });

    const response = await request(app)
      .post('/api/admin/exams/11111111-1111-4111-8111-111111111111/participants')
      .set('Authorization', `Bearer ${createAccessToken('teacher-1', 'teacher')}`)
      .send({
        participants: [
          {
            email: 'guest@example.com',
            fullName: 'Guest Student',
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(addAdminExamParticipants).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'teacher-1',
      {
        participants: [
          {
            email: 'guest@example.com',
            fullName: 'Guest Student',
          },
        ],
      },
    );
    expect(response.body).toEqual({
      data: [{ id: 'participant-1', approvalStatus: 'approved' }],
    });
  });

  it('forwards publish requests with the authenticated teacher actorId', async () => {
    const publishExam = jest.fn().mockResolvedValue({
      id: 'exam-1',
      status: 'published',
    });
    const { app } = await createAdminExamApp({
      listAdminExams: jest.fn(),
      getAdminExamById: jest.fn(),
      createAdminExam: jest.fn(),
      updateAdminExam: jest.fn(),
      publishExam,
      listAdminExamParticipants: jest.fn(),
      addAdminExamParticipants: jest.fn(),
      approveParticipant: jest.fn(),
      rejectParticipant: jest.fn(),
      revokeParticipant: jest.fn(),
      resendInvite: jest.fn(),
      bindParticipantAccount: jest.fn(),
      mergeParticipants: jest.fn(),
    });

    const response = await request(app)
      .post('/api/admin/exams/11111111-1111-4111-8111-111111111111/publish')
      .set('Authorization', `Bearer ${createAccessToken('teacher-1', 'teacher')}`);

    expect(response.status).toBe(200);
    expect(publishExam).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'teacher-1',
    );
    expect(response.body).toMatchObject({
      id: 'exam-1',
      status: 'published',
    });
  });

  it('forwards cancel requests with the authenticated teacher actorId', async () => {
    const cancelExam = jest.fn().mockResolvedValue({
      id: 'exam-1',
      status: 'cancelled',
      isVisible: false,
    });
    const { app } = await createAdminExamApp({
      listAdminExams: jest.fn(),
      getAdminExamById: jest.fn(),
      createAdminExam: jest.fn(),
      updateAdminExam: jest.fn(),
      publishExam: jest.fn(),
      cancelExam,
      archiveExam: jest.fn(),
      listAdminExamParticipants: jest.fn(),
      addAdminExamParticipants: jest.fn(),
      approveParticipant: jest.fn(),
      rejectParticipant: jest.fn(),
      revokeParticipant: jest.fn(),
      resendInvite: jest.fn(),
      bindParticipantAccount: jest.fn(),
      mergeParticipants: jest.fn(),
    });

    const response = await request(app)
      .post('/api/admin/exams/11111111-1111-4111-8111-111111111111/cancel')
      .set('Authorization', `Bearer ${createAccessToken('teacher-1', 'teacher')}`);

    expect(response.status).toBe(200);
    expect(cancelExam).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'teacher-1',
    );
    expect(response.body).toMatchObject({
      id: 'exam-1',
      status: 'cancelled',
      isVisible: false,
    });
  });

  it('forwards archive requests with the authenticated teacher actorId', async () => {
    const archiveExam = jest.fn().mockResolvedValue({
      id: 'exam-1',
      status: 'archived',
      isVisible: false,
    });
    const { app } = await createAdminExamApp({
      listAdminExams: jest.fn(),
      getAdminExamById: jest.fn(),
      createAdminExam: jest.fn(),
      updateAdminExam: jest.fn(),
      publishExam: jest.fn(),
      cancelExam: jest.fn(),
      archiveExam,
      listAdminExamParticipants: jest.fn(),
      addAdminExamParticipants: jest.fn(),
      approveParticipant: jest.fn(),
      rejectParticipant: jest.fn(),
      revokeParticipant: jest.fn(),
      resendInvite: jest.fn(),
      bindParticipantAccount: jest.fn(),
      mergeParticipants: jest.fn(),
    });

    const response = await request(app)
      .post('/api/admin/exams/11111111-1111-4111-8111-111111111111/archive')
      .set('Authorization', `Bearer ${createAccessToken('teacher-1', 'teacher')}`);

    expect(response.status).toBe(200);
    expect(archiveExam).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'teacher-1',
    );
    expect(response.body).toMatchObject({
      id: 'exam-1',
      status: 'archived',
      isVisible: false,
    });
  });

  it('forwards participant approval with the authenticated actorId', async () => {
    const approveParticipant = jest.fn().mockResolvedValue({
      id: 'participant-1',
      approvalStatus: 'approved',
    });
    const { app } = await createAdminExamApp({
      listAdminExams: jest.fn(),
      getAdminExamById: jest.fn(),
      createAdminExam: jest.fn(),
      updateAdminExam: jest.fn(),
      publishExam: jest.fn(),
      listAdminExamParticipants: jest.fn(),
      addAdminExamParticipants: jest.fn(),
      approveParticipant,
      rejectParticipant: jest.fn(),
      revokeParticipant: jest.fn(),
      resendInvite: jest.fn(),
      bindParticipantAccount: jest.fn(),
      mergeParticipants: jest.fn(),
    });

    const response = await request(app)
      .post(
        '/api/admin/exams/11111111-1111-4111-8111-111111111111/participants/22222222-2222-4222-8222-222222222222/approve',
      )
      .set('Authorization', `Bearer ${createAccessToken('teacher-1', 'teacher')}`);

    expect(response.status).toBe(200);
    expect(approveParticipant).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'teacher-1',
    );
    expect(response.body).toMatchObject({
      id: 'participant-1',
      approvalStatus: 'approved',
    });
  });

  it('forwards merge requests with the authenticated actorId', async () => {
    const mergeParticipants = jest.fn().mockResolvedValue({
      id: 'participant-target',
      approvalStatus: 'approved',
    });
    const { app } = await createAdminExamApp({
      listAdminExams: jest.fn(),
      getAdminExamById: jest.fn(),
      createAdminExam: jest.fn(),
      updateAdminExam: jest.fn(),
      publishExam: jest.fn(),
      listAdminExamParticipants: jest.fn(),
      addAdminExamParticipants: jest.fn(),
      approveParticipant: jest.fn(),
      rejectParticipant: jest.fn(),
      revokeParticipant: jest.fn(),
      resendInvite: jest.fn(),
      bindParticipantAccount: jest.fn(),
      mergeParticipants,
    });

    const response = await request(app)
      .post('/api/admin/exams/11111111-1111-4111-8111-111111111111/participants/merge')
      .set('Authorization', `Bearer ${createAccessToken('teacher-1', 'teacher')}`)
      .send({
        sourceParticipantId: '22222222-2222-4222-8222-222222222222',
        targetParticipantId: '33333333-3333-4333-8333-333333333333',
      });

    expect(response.status).toBe(200);
    expect(mergeParticipants).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'teacher-1',
      {
        sourceParticipantId: '22222222-2222-4222-8222-222222222222',
        targetParticipantId: '33333333-3333-4333-8333-333333333333',
      },
    );
    expect(response.body).toMatchObject({
      id: 'participant-target',
      approvalStatus: 'approved',
    });
  });
});
