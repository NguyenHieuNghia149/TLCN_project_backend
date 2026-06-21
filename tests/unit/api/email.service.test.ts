jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(),
  },
}));

import nodemailer from 'nodemailer';
import {
  createEMailService,
  createEMailTransporter,
  EMailService,
  IEmailTransporter,
  otpStore,
} from '@backend/api/services/email.service';
import { config } from '@backend/api/config/email';

describe('EMailService', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowTestOtp = process.env.ALLOW_TEST_OTP;

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.useRealTimers();
    otpStore.clear();
    process.env.NODE_ENV = originalNodeEnv;
    if (originalAllowTestOtp === undefined) {
      delete process.env.ALLOW_TEST_OTP;
    } else {
      process.env.ALLOW_TEST_OTP = originalAllowTestOtp;
    }
  });

  it('stores an OTP and sends the verification email through the injected transporter', async () => {
    const transporter: IEmailTransporter = {
      sendMail: jest.fn().mockResolvedValue(undefined),
    };
    const service = new EMailService({ transporter });

    await service.sendVerificationCode('email-test@example.com');

    expect(otpStore.has('email-test@example.com')).toBe(true);
    expect(transporter.sendMail).toHaveBeenCalledTimes(1);
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: config.email.from,
        to: 'email-test@example.com',
        subject: 'Your Verification Code',
      }),
    );
  });

  it('sends exam registration received email with escaped registration password', async () => {
    const transporter: IEmailTransporter = {
      sendMail: jest.fn().mockResolvedValue(undefined),
    };
    const service = new EMailService({ transporter });

    await service.sendExamRegistrationReceivedEmail({
      to: 'student@example.com',
      fullName: 'Exam Student',
      examTitle: 'Spring Midterm',
      examSlug: 'spring-midterm',
      approvalStatus: 'approved',
      registrationPassword: '<Exam&123>',
    });

    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: config.email.from,
        to: 'student@example.com',
        subject: 'Registration received: Spring Midterm',
        html: expect.stringContaining('&lt;Exam&amp;123&gt;'),
      }),
    );
    expect((transporter.sendMail as jest.Mock).mock.calls[0][0].html).not.toContain(
      '<strong><Exam&123></strong>',
    );
  });

  it('sends approved exam decision email with password and rejected email without password', async () => {
    const transporter: IEmailTransporter = {
      sendMail: jest.fn().mockResolvedValue(undefined),
    };
    const service = new EMailService({ transporter });

    await service.sendExamParticipantDecisionEmail({
      to: 'student@example.com',
      fullName: 'Exam Student',
      examTitle: 'Spring Midterm',
      examSlug: 'spring-midterm',
      decision: 'approved',
      registrationPassword: 'Manual#1234',
    });
    await service.sendExamParticipantDecisionEmail({
      to: 'student@example.com',
      fullName: 'Exam Student',
      examTitle: 'Spring Midterm',
      examSlug: 'spring-midterm',
      decision: 'rejected',
      registrationPassword: 'Manual#1234',
    });

    expect(transporter.sendMail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        subject: 'Registration approved: Spring Midterm',
        html: expect.stringContaining('Manual#1234'),
      }),
    );
    expect(transporter.sendMail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        subject: 'Registration rejected: Spring Midterm',
        html: expect.not.stringContaining('Manual#1234'),
      }),
    );
  });

  it('sends exam invite and reschedule emails through exam-specific methods', async () => {
    const transporter: IEmailTransporter = {
      sendMail: jest.fn().mockResolvedValue(undefined),
    };
    const service = new EMailService({ transporter });

    await service.sendExamParticipantInviteEmail({
      to: 'student@example.com',
      fullName: 'Exam Student',
      examTitle: 'Spring Midterm',
      examSlug: 'spring-midterm',
      inviteToken: 'invite-token',
      startDate: new Date('2099-05-01T09:00:00.000Z'),
      endDate: new Date('2099-05-01T12:00:00.000Z'),
    });
    await service.sendExamRescheduledEmail({
      to: 'student@example.com',
      examTitle: 'Spring Midterm',
      examSlug: 'spring-midterm',
      startDate: new Date('2099-05-02T09:00:00.000Z'),
      endDate: new Date('2099-05-02T12:00:00.000Z'),
    });

    expect(transporter.sendMail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        subject: 'Invitation to exam: Spring Midterm',
        html: expect.stringContaining('/exam/spring-midterm/entry?invite=invite-token'),
      }),
    );
    expect(transporter.sendMail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        subject: 'Exam rescheduled: Spring Midterm',
        html: expect.stringContaining('2099-05-02T09:00:00.000Z'),
      }),
    );
  });

  it('verifies a matching OTP successfully', async () => {
    const service = new EMailService({
      transporter: { sendMail: jest.fn().mockResolvedValue(undefined) },
    });
    otpStore.set('verify-success@example.com', {
      email: 'verify-success@example.com',
      otp: '123456',
      expires: new Date(Date.now() + 60_000),
    });

    await expect(service.verifyOTP('verify-success@example.com', '123456')).resolves.toBe(true);
  });

  it('rejects an invalid OTP and clears the stored value', async () => {
    const service = new EMailService({
      transporter: { sendMail: jest.fn().mockResolvedValue(undefined) },
    });
    otpStore.set('verify-invalid@example.com', {
      email: 'verify-invalid@example.com',
      otp: '123456',
      expires: new Date(Date.now() + 60_000),
    });

    await expect(service.verifyOTP('verify-invalid@example.com', '000000')).rejects.toThrow('Invalid OTP');
    expect(otpStore.has('verify-invalid@example.com')).toBe(false);
  });

  it('does not accept the test OTP outside an explicit test override', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_TEST_OTP;
    const service = new EMailService({
      transporter: { sendMail: jest.fn().mockResolvedValue(undefined) },
    });
    otpStore.set('verify-test-otp@example.com', {
      email: 'verify-test-otp@example.com',
      otp: '654321',
      expires: new Date(Date.now() + 60_000),
    });

    await expect(service.verifyOTP('verify-test-otp@example.com', '123456')).rejects.toThrow(
      'Invalid OTP',
    );
  });

  it('rejects an expired OTP without sleeping in real time', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    const service = new EMailService({
      transporter: { sendMail: jest.fn().mockResolvedValue(undefined) },
    });
    otpStore.set('verify-expired@example.com', {
      email: 'verify-expired@example.com',
      otp: '123456',
      expires: new Date(Date.now() + config.otp.expiryMinutes * 60_000),
    });

    jest.advanceTimersByTime((config.otp.expiryMinutes + 1) * 60_000);

    await expect(service.verifyOTP('verify-expired@example.com', '123456')).rejects.toThrow(
      'OTP has expired',
    );
    expect(otpStore.has('verify-expired@example.com')).toBe(false);
  });

  it('creates an email service from the default factory', () => {
    const transporter = { sendMail: jest.fn().mockResolvedValue(undefined) };
    const service = createEMailService({ transporter });

    expect(service).toBeInstanceOf(EMailService);
    expect((service as any).transporter).toBe(transporter);
  });

  it('creates a nodemailer transporter from the current config', () => {
    const fakeTransporter = { sendMail: jest.fn() };
    const createTransport = nodemailer.createTransport as jest.Mock;
    createTransport.mockReturnValue(fakeTransporter);

    const transporter = createEMailTransporter();

    expect(transporter).toBe(fakeTransporter);
    expect(createTransport).toHaveBeenCalledWith({
      host: config.email.host,
      port: config.email.port,
      secure: false,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false,
      },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 15000,
      pool: true,
      maxConnections: 5,
      maxMessages: 10,
      rateDelta: 1000,
      rateLimit: 5,
      logger: true,
      debug: process.env.NODE_ENV === 'production',
    });
  });
});
