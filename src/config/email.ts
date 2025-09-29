export const config = {
  email: {
    from: process.env.EMAIL_FROM || '',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASSWORD || '',
  },
  otp: {
    length: 6,
    expiryMinutes: 10,
    maxAttempts: 3,
  },
  rateLimit: {
    attempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
};
