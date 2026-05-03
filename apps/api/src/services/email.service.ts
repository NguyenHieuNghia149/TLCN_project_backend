import { logger } from '@backend/shared/utils';
import { Request } from 'express';
import nodemailer from 'nodemailer';
import { config } from '../config/email';
import {
  InvalidCredentialsException,
  RateLimitExceededException,
  ValidationException,
} from '../exceptions/auth.exceptions';

export interface OTPData {
  otp: string;
  expires: Date;
  email: string;
}

export interface ApiResponse {
  success: boolean;
  message: string;
  data?: any;
}

export interface AuthRequest extends Request {
  body: {
    email: string;
    otp?: string;
    newPassword?: string;
  };
}

type ExamEmailDate = Date | string | null | undefined;

export type ExamParticipantDecision = 'approved' | 'rejected';

export interface ExamRegistrationReceivedEmailInput {
  to: string;
  fullName: string;
  examTitle: string;
  examSlug: string;
  approvalStatus: string;
  registrationPassword?: string | null;
}

export interface ExamParticipantDecisionEmailInput {
  to: string;
  fullName: string;
  examTitle: string;
  examSlug: string;
  decision: ExamParticipantDecision;
  registrationPassword?: string | null;
}

export interface ExamParticipantInviteEmailInput {
  to: string;
  fullName: string;
  examTitle: string;
  examSlug: string;
  inviteToken: string;
  startDate: ExamEmailDate;
  endDate: ExamEmailDate;
}

export interface ExamRescheduledEmailInput {
  to: string;
  examTitle: string;
  examSlug: string;
  startDate: ExamEmailDate;
  endDate: ExamEmailDate;
}

export const otpStore = new Map<string, OTPData>();

/** Minimal transport contract used by EMailService. */
export interface IEmailTransporter {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<unknown>;
}

type EMailServiceDependencies = {
  transporter: IEmailTransporter;
};

export class EMailService {
  private transporter: IEmailTransporter;

  constructor({ transporter }: EMailServiceDependencies) {
    this.transporter = transporter;
  }

  generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendMail(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<void> {
    await this.transporter.sendMail({
      from: config.email.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
  }

  async sendExamRegistrationReceivedEmail(
    input: ExamRegistrationReceivedEmailInput,
  ): Promise<void> {
    await this.sendMail({
      to: input.to,
      subject: `Registration received: ${input.examTitle}`,
      html: `
        <p>Hello ${this.escapeHtml(input.fullName)},</p>
        <p>Your registration for <strong>${this.escapeHtml(input.examTitle)}</strong> has been received.</p>
        <p>Status: <strong>${this.escapeHtml(input.approvalStatus)}</strong></p>
        ${this.buildRegistrationPasswordHtml(input.registrationPassword)}
        <p>You can track access from: <a href="${this.escapeHtml(this.buildExamLandingUrl(input.examSlug))}">${this.escapeHtml(this.buildExamLandingUrl(input.examSlug))}</a></p>
      `,
    });
  }

  async sendExamParticipantDecisionEmail(
    input: ExamParticipantDecisionEmailInput,
  ): Promise<void> {
    const subject =
      input.decision === 'approved'
        ? `Registration approved: ${input.examTitle}`
        : `Registration rejected: ${input.examTitle}`;
    const html =
      input.decision === 'approved'
        ? `
          <p>Hello ${this.escapeHtml(input.fullName)},</p>
          <p>Your registration for <strong>${this.escapeHtml(input.examTitle)}</strong> has been approved.</p>
          ${this.buildRegistrationPasswordHtml(input.registrationPassword)}
          <p>You can access the exam from: <a href="${this.escapeHtml(this.buildExamLandingUrl(input.examSlug))}">${this.escapeHtml(this.buildExamLandingUrl(input.examSlug))}</a></p>
        `
        : `
          <p>Hello ${this.escapeHtml(input.fullName)},</p>
          <p>Your registration for <strong>${this.escapeHtml(input.examTitle)}</strong> has been rejected.</p>
        `;

    await this.sendMail({
      to: input.to,
      subject,
      html,
    });
  }

  async sendExamParticipantInviteEmail(input: ExamParticipantInviteEmailInput): Promise<void> {
    const inviteUrl = this.buildInviteUrl(input.examSlug, input.inviteToken);

    await this.sendMail({
      to: input.to,
      subject: `Invitation to exam: ${input.examTitle}`,
      html: `
        <p>Hello ${this.escapeHtml(input.fullName)},</p>
        <p>You have been invited to the exam <strong>${this.escapeHtml(input.examTitle)}</strong>.</p>
        <p>Start: ${this.asIsoString(input.startDate)}</p>
        <p>End: ${this.asIsoString(input.endDate)}</p>
        <p>Access your exam here:</p>
        <p><a href="${this.escapeHtml(inviteUrl)}">${this.escapeHtml(inviteUrl)}</a></p>
      `,
    });
  }

  async sendExamRescheduledEmail(input: ExamRescheduledEmailInput): Promise<void> {
    const examUrl = this.buildExamLandingUrl(input.examSlug);

    await this.sendMail({
      to: input.to,
      subject: `Exam rescheduled: ${input.examTitle}`,
      html: `
        <p>The exam <strong>${this.escapeHtml(input.examTitle)}</strong> has been rescheduled.</p>
        <p>Start: ${this.asIsoString(input.startDate)}</p>
        <p>End: ${this.asIsoString(input.endDate)}</p>
        <p>Access link: <a href="${this.escapeHtml(examUrl)}">${this.escapeHtml(examUrl)}</a></p>
      `,
    });
  }

  async sendVerificationCode(email: string): Promise<void> {
    try {
      const otp = this.generateOTP();
      const expires = new Date(Date.now() + config.otp.expiryMinutes * 60000);

      otpStore.set(email, { otp, expires, email });

      const emailTemplate = {
        from: config.email.from,
        to: email,
        subject: 'Your Verification Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Verification Code</h2>
            <p>Your verification code is:</p>
            <div style="background: #007bff; color: white; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; border-radius: 5px; margin: 20px 0;">
              ${otp}
            </div>
            <p>This code will expire in ${config.otp.expiryMinutes} minutes.</p>
            <p>Please do not share this code with anyone.</p>
          </div>
        `,
        text: `Your verification code is ${otp}. It will expire in ${config.otp.expiryMinutes} minutes.`,
      };

      logger.info(`[Email Service] Attempting to send OTP to ${email}`);
      logger.info(
        `[Email Service] SMTP Config: ${config.email.host}:${config.email.port}, User: ${config.email.user}`,
      );

      await this.transporter.sendMail(emailTemplate);

      logger.info(`[Email Service] âœ… OTP sent successfully to ${email}`);
    } catch (error) {
      logger.error(`[Email Service] âŒ Failed to send OTP to ${email}:`, error);

      logger.error('[Email Service] SMTP Config Check:', {
        host: config.email.host,
        port: config.email.port,
        user: config.email.user,
        hasPassword: !!config.email.pass,
        from: config.email.from,
      });

      throw new ValidationException(
        `Failed to send verification email. Please check SMTP configuration. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async verifyOTP(email: string, providedOTP: string): Promise<boolean> {
    const otpData = otpStore.get(email);

    if (!otpData) {
      throw new ValidationException('No OTP found for this email');
    }

    if (new Date() > otpData.expires) {
      otpStore.delete(email);
      throw new ValidationException('OTP has expired');
    }

    const isTestOTP =
      process.env.NODE_ENV === 'test' &&
      process.env.ALLOW_TEST_OTP === 'true' &&
      providedOTP === '123456';
    const isValid = otpData.otp === providedOTP || isTestOTP;

    if (!isValid) {
      otpStore.delete(email);
      throw new ValidationException('Invalid OTP');
    }

    otpStore.delete(email);
    return isValid;
  }

  private buildRegistrationPasswordHtml(registrationPassword?: string | null) {
    if (!registrationPassword) {
      return '';
    }

    return `<p>Exam password: <strong>${this.escapeHtml(registrationPassword)}</strong></p>`;
  }

  private buildExamLandingUrl(slug: string) {
    const origin = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
    return `${origin.replace(/\/$/, '')}/exam/${slug}`;
  }

  private buildInviteUrl(slug: string, inviteToken: string) {
    return `${this.buildExamLandingUrl(slug)}/entry?invite=${inviteToken}`;
  }

  private asIsoString(value: ExamEmailDate) {
    if (!value) {
      return new Date(0).toISOString();
    }

    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

/** Creates the concrete Nodemailer transporter from the current email config. */
export function createEMailTransporter(): IEmailTransporter {
  return nodemailer.createTransport({
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
}

/** Creates an email service for auth composition roots. */
export function createEMailService(options: { transporter?: IEmailTransporter } = {}): EMailService {
  return new EMailService({
    transporter: options.transporter ?? createEMailTransporter(),
  });
}
