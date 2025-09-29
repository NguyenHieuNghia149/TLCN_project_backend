import { Request } from 'express';
import nodemailer from 'nodemailer';
import { config } from '@/config/email';
import {
  InvalidCredentialsException,
  RateLimitExceededException,
  ValidationException,
} from '@/exceptions/auth.exceptions';
import { RateLimitUtils } from '@/utils/security';
import { UserRepository } from '@/repositories/user.repository';

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
  private userRepository: UserRepository;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: false,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
    });
    this.userRepository = new UserRepository();
  }

  generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendVerificationCode(email: string, req: Request): Promise<void> {
    const rateLimitKey = `sendVeriCode:${req.ip}`;
    const rateLimit = RateLimitUtils.checkRateLimit(rateLimitKey, 20, 15 * 60 * 1000);

    if (!rateLimit.allowed) {
      throw new RateLimitExceededException();
    }

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

    await this.transporter.sendMail(emailTemplate);
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

    if (isValid) {
      otpStore.delete(email);
    } else {
      otpStore.set(email, otpData);
    }

    return isValid;
  }
}
