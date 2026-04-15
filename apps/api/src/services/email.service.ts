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

    const isValid = otpData.otp === providedOTP;

    if (!isValid) {
      otpStore.delete(email);
      throw new ValidationException('Invalid OTP');
    }

    otpStore.set(email, otpData);
    return isValid;
  }

  // --- Ban/Unban Notification Methods ---

  async sendBanNotification(
    email: string,
    userName: string,
    banReason: string,
  ): Promise<void> {
    try {
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #d32f2f;">Account Suspension Notice</h2>
          <p>Dear ${this.escapeHtml(userName)},</p>
          <p>Your account has been suspended due to the following reason:</p>
          <blockquote style="background: #f5f5f5; padding: 10px; border-left: 4px solid #d32f2f; margin: 15px 0;">
            ${this.escapeHtml(banReason)}
          </blockquote>
          <p>If you believe this is a mistake, please contact our support team.</p>
          <p style="margin-top: 30px; color: #666;">
            Best regards,<br/>
            <strong>The Admin Team</strong>
          </p>
        </div>
      `;

      await this.transporter.sendMail({
        from: config.email.from,
        to: email,
        subject: 'Your Account Has Been Suspended',
        html: htmlContent,
      });

      logger.info(`Ban notification sent to ${email}`);
    } catch (error) {
      logger.error(`Failed to send ban notification to ${email}:`, error);
    }
  }

  async sendUnbanNotification(
    email: string,
    userName: string,
  ): Promise<void> {
    try {
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #22863a;">Account Restored</h2>
          <p>Dear ${this.escapeHtml(userName)},</p>
          <p>Good news! Your account suspension has been lifted. You can now access the platform again.</p>
          <p style="margin-top: 30px; color: #666;">
            Welcome back!<br/>
            <strong>The Admin Team</strong>
          </p>
        </div>
      `;

      await this.transporter.sendMail({
        from: config.email.from,
        to: email,
        subject: 'Your Account Has Been Restored',
        html: htmlContent,
      });

      logger.info(`Unban notification sent to ${email}`);
    } catch (error) {
      logger.error(`Failed to send unban notification to ${email}:`, error);
    }
  }

  // Helper: Escape HTML to prevent injection
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m: string) => map[m] || m);
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
