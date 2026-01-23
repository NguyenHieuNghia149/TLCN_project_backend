import { Request } from 'express';
import nodemailer from 'nodemailer';
import { config } from '@/config/email';
import {
  InvalidCredentialsException,
  RateLimitExceededException,
  ValidationException,
} from '@/exceptions/auth.exceptions';

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

export class EMailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: false,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
      tls: {
        // Add this line so Node.js does not reject Brevo's certificate
        ciphers: 'SSLv3',
        rejectUnauthorized: false,
      },
      // Connection timeout settings
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 5000, // 5 seconds
      socketTimeout: 15000, // 15 seconds
      // Connection pool settings
      pool: true,
      maxConnections: 5,
      maxMessages: 10,
      rateDelta: 1000,
      rateLimit: 5,
      // Debug
      logger: true,
      debug: process.env.NODE_ENV === 'production',
    });
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

      console.log(`[Email Service] Attempting to send OTP to ${email}`);
      console.log(
        `[Email Service] SMTP Config: ${config.email.host}:${config.email.port}, User: ${config.email.user}`
      );

      await this.transporter.sendMail(emailTemplate);

      console.log(`[Email Service] ✅ OTP sent successfully to ${email}`);
    } catch (error) {
      console.error(`[Email Service] ❌ Failed to send OTP to ${email}:`, error);

      // Log SMTP configuration status (without exposing password)
      console.error('[Email Service] SMTP Config Check:', {
        host: config.email.host,
        port: config.email.port,
        user: config.email.user,
        hasPassword: !!config.email.pass,
        from: config.email.from,
      });

      throw new ValidationException(
        `Failed to send verification email. Please check SMTP configuration. Error: ${error instanceof Error ? error.message : 'Unknown error'}`
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
    } else {
      otpStore.set(email, otpData);
    }

    return isValid;
  }
}
