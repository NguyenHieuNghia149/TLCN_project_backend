import { EMailService } from '../../../apps/api/src/services/email.service';

describe('EmailService - Ban Notifications', () => {
  let emailService: EMailService;
  let mockTransporter: any;

  beforeEach(() => {
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-1' }),
    };
    // Mock the email service with transporter
    emailService = new EMailService(mockTransporter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendBanNotification', () => {
    it('sends HTML email with escaped user name and ban reason', async () => {
      const email = 'user@example.com';
      const userName = 'John <script>alert("xss")</script> Doe';
      const banReason = 'Spam violation <img src=x onerror=alert("xss")>';

      await emailService.sendBanNotification(email, userName, banReason);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: expect.stringContaining('Account Suspended'),
          html: expect.stringMatching(/&lt;script&gt;/),
        })
      );

      // Verify that HTML is properly escaped
      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('&lt;script&gt;');
      expect(callArgs.html).toContain('&lt;img');
      expect(callArgs.html).toContain('&quot;');
    });

    it('handles special HTML characters in ban reason', async () => {
      const email = 'test@example.com';
      const userName = 'Test User';
      const banReason = 'Violation of T&C & community rules <tag>';

      await emailService.sendBanNotification(email, userName, banReason);

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('&amp;');
      expect(callArgs.html).toContain('&lt;tag&gt;');
    });

    it('logs error but does not throw on send failure', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockTransporter.sendMail.mockRejectedValueOnce(
        new Error('SMTP error')
      );

      const email = 'user@example.com';
      const userName = 'John Doe';
      const banReason = 'Test ban';

      // Should not throw
      await expect(
        emailService.sendBanNotification(email, userName, banReason)
      ).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send ban notification')
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('sendUnbanNotification', () => {
    it('sends HTML email with escaped user name', async () => {
      const email = 'user@example.com';
      const userName = 'Jane <script>alert("xss")</script> Smith';

      await emailService.sendUnbanNotification(email, userName);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: email,
          subject: expect.stringContaining('Account Restored'),
          html: expect.stringMatching(/&lt;script&gt;/),
        })
      );
    });

    it('logs error but does not throw on send failure', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockTransporter.sendMail.mockRejectedValueOnce(
        new Error('SMTP error')
      );

      const email = 'user@example.com';
      const userName = 'John Doe';

      // Should not throw
      await expect(
        emailService.sendUnbanNotification(email, userName)
      ).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send unban notification')
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('escapeHtml', () => {
    it('escapes HTML special characters', () => {
      const dirty = 'Hello <script>alert("xss")</script> World';
      const escaped = emailService['escapeHtml'](dirty);

      expect(escaped).toBe(
        'Hello &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; World'
      );
      expect(escaped).not.toContain('<script>');
      expect(escaped).not.toContain('"');
    });

    it('escapes ampersand first to prevent double escaping', () => {
      const text = 'A & B';
      const escaped = emailService['escapeHtml'](text);

      expect(escaped).toBe('A &amp; B');
      expect(escaped).not.toContain('&&amp;');
    });

    it('escapes all dangerous characters', () => {
      const dangerous = '<img src=x onerror="alert(\'xss\')">';
      const escaped = emailService['escapeHtml'](dangerous);

      expect(escaped).toContain('&lt;');
      expect(escaped).toContain('&gt;');
      expect(escaped).toContain('&quot;');
      expect(escaped).toContain('&amp;');
      expect(escaped).not.toContain('<');
      expect(escaped).not.toContain('>');
      expect(escaped).not.toContain('"');
    });
  });
});
