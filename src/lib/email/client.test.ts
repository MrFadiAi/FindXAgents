import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before imports
vi.mock('./providers/resend.js', () => ({
  createResendProvider: vi.fn(),
}));

vi.mock('./providers/gmail.js', () => ({
  createGmailProvider: vi.fn(),
}));

vi.mock('./gmail-oauth.js', () => ({
  getStoredTokens: vi.fn(),
}));

// Import mocked modules and SUT
import { createResendProvider } from './providers/resend.js';
import { createGmailProvider } from './providers/gmail.js';
import { getStoredTokens } from './gmail-oauth.js';
import {
  resetProviderCache,
  isEmailConfigured,
  sendEmail,
} from './client.js';
import type { EmailProvider, SendResult } from './providers/types.js';

// Helper to build a mock provider
function mockProvider(isConfigured: boolean, sendResult: SendResult): EmailProvider {
  return {
    isConfigured: vi.fn().mockResolvedValue(isConfigured),
    send: vi.fn().mockResolvedValue(sendResult),
  };
}

describe('src/lib/email/client.ts', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    resetProviderCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetProviderCache();
  });

  describe('resetProviderCache()', () => {
    it('should clear the cached provider so the next call re-evaluates', async () => {
      const provider = mockProvider(true, { id: 'test', from: 'a@b.com', to: 'c@d.com' });
      vi.mocked(createResendProvider).mockReturnValue(provider);
      process.env.EMAIL_PROVIDER = undefined;
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;

      // First call caches
      await sendEmail('a@b.com', 'Sub', '<p>Hello</p>');
      expect(createResendProvider).toHaveBeenCalledTimes(1);

      // Second call uses cache
      await sendEmail('a@b.com', 'Sub', '<p>Hello</p>');
      expect(createResendProvider).toHaveBeenCalledTimes(1);

      // Reset cache
      resetProviderCache();

      // Third call re-evaluates
      await sendEmail('a@b.com', 'Sub', '<p>Hello</p>');
      expect(createResendProvider).toHaveBeenCalledTimes(2);
    });
  });

  describe('Provider selection (getActiveProvider)', () => {
    it('should use Resend by default when no Gmail config is present', async () => {
      const resendProvider = mockProvider(true, { id: 'r1', from: 'x@y.com', to: 'z@y.com' });
      vi.mocked(createResendProvider).mockReturnValue(resendProvider);

      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.EMAIL_PROVIDER;

      await sendEmail('test@test.com', 'Subject', '<p>Hi</p>');

      expect(createResendProvider).toHaveBeenCalledTimes(1);
      expect(createGmailProvider).not.toHaveBeenCalled();
    });

    it('should use Gmail when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set and tokens exist', async () => {
      const gmailProvider = mockProvider(true, { id: 'g1', from: 'a@b.com', to: 'c@d.com' });
      vi.mocked(createGmailProvider).mockReturnValue(gmailProvider);
      vi.mocked(getStoredTokens).mockResolvedValue({ access_token: 'token', refresh_token: 'refresh' });

      process.env.GOOGLE_CLIENT_ID = 'mock-id';
      process.env.GOOGLE_CLIENT_SECRET = 'mock-secret';

      await sendEmail('test@test.com', 'Subject', '<p>Hi</p>');

      expect(getStoredTokens).toHaveBeenCalledTimes(1);
      expect(createGmailProvider).toHaveBeenCalledTimes(1);
      expect(createResendProvider).not.toHaveBeenCalled();
    });

    it('should fallback to Resend when Gmail env vars are set but no tokens exist', async () => {
      const resendProvider = mockProvider(true, { id: 'r2', from: 'x@y.com', to: 'z@y.com' });
      vi.mocked(createResendProvider).mockReturnValue(resendProvider);
      vi.mocked(getStoredTokens).mockResolvedValue(null);

      process.env.GOOGLE_CLIENT_ID = 'mock-id';
      process.env.GOOGLE_CLIENT_SECRET = 'mock-secret';
      delete process.env.EMAIL_PROVIDER;

      await sendEmail('test@test.com', 'Subject', '<p>Hi</p>');

      expect(getStoredTokens).toHaveBeenCalledTimes(1);
      expect(createResendProvider).toHaveBeenCalledTimes(1);
      expect(createGmailProvider).not.toHaveBeenCalled();
    });

    it('should fallback to Resend when only GOOGLE_CLIENT_ID is set (incomplete config)', async () => {
      const resendProvider = mockProvider(true, { id: 'r3', from: 'x@y.com', to: 'z@y.com' });
      vi.mocked(createResendProvider).mockReturnValue(resendProvider);

      process.env.GOOGLE_CLIENT_ID = 'mock-id';
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.EMAIL_PROVIDER;

      await sendEmail('test@test.com', 'Subject', '<p>Hi</p>');

      expect(getStoredTokens).not.toHaveBeenCalled();
      expect(createResendProvider).toHaveBeenCalledTimes(1);
    });

    it('should fallback to Resend when only GOOGLE_CLIENT_SECRET is set (incomplete config)', async () => {
      const resendProvider = mockProvider(true, { id: 'r4', from: 'x@y.com', to: 'z@y.com' });
      vi.mocked(createResendProvider).mockReturnValue(resendProvider);

      delete process.env.GOOGLE_CLIENT_ID;
      process.env.GOOGLE_CLIENT_SECRET = 'mock-secret';
      delete process.env.EMAIL_PROVIDER;

      await sendEmail('test@test.com', 'Subject', '<p>Hi</p>');

      expect(getStoredTokens).not.toHaveBeenCalled();
      expect(createResendProvider).toHaveBeenCalledTimes(1);
    });

    it('should use Gmail when EMAIL_PROVIDER env var is explicitly set to "gmail"', async () => {
      const gmailProvider = mockProvider(true, { id: 'g2', from: 'a@b.com', to: 'c@d.com' });
      vi.mocked(createGmailProvider).mockReturnValue(gmailProvider);

      // No Google OAuth credentials set, but EMAIL_PROVIDER=gmail
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      process.env.EMAIL_PROVIDER = 'gmail';

      await sendEmail('test@test.com', 'Subject', '<p>Hi</p>');

      expect(createGmailProvider).toHaveBeenCalledTimes(1);
      expect(getStoredTokens).not.toHaveBeenCalled();
      expect(createResendProvider).not.toHaveBeenCalled();
    });

    it('should use Resend when EMAIL_PROVIDER is set to something other than "gmail"', async () => {
      const resendProvider = mockProvider(true, { id: 'r5', from: 'x@y.com', to: 'z@y.com' });
      vi.mocked(createResendProvider).mockReturnValue(resendProvider);

      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      process.env.EMAIL_PROVIDER = 'resend';

      await sendEmail('test@test.com', 'Subject', '<p>Hi</p>');

      expect(createResendProvider).toHaveBeenCalledTimes(1);
      expect(createGmailProvider).not.toHaveBeenCalled();
    });

    it('should prefer Gmail OAuth over EMAIL_PROVIDER when both are configured and tokens exist', async () => {
      const gmailProvider = mockProvider(true, { id: 'g3', from: 'a@b.com', to: 'c@d.com' });
      vi.mocked(createGmailProvider).mockReturnValue(gmailProvider);
      vi.mocked(getStoredTokens).mockResolvedValue({ access_token: 't', refresh_token: 'r' });

      process.env.GOOGLE_CLIENT_ID = 'id';
      process.env.GOOGLE_CLIENT_SECRET = 'secret';
      process.env.EMAIL_PROVIDER = 'resend';

      await sendEmail('test@test.com', 'Subject', '<p>Hi</p>');

      // Gmail should be selected because OAuth credentials + tokens take priority
      expect(createGmailProvider).toHaveBeenCalledTimes(1);
      expect(createResendProvider).not.toHaveBeenCalled();
    });

    it('should use EMAIL_PROVIDER=gmail as fallback when OAuth credentials exist but no tokens', async () => {
      const gmailProvider = mockProvider(true, { id: 'g4', from: 'a@b.com', to: 'c@d.com' });
      vi.mocked(createGmailProvider).mockReturnValue(gmailProvider);
      vi.mocked(getStoredTokens).mockResolvedValue(null);

      process.env.GOOGLE_CLIENT_ID = 'id';
      process.env.GOOGLE_CLIENT_SECRET = 'secret';
      process.env.EMAIL_PROVIDER = 'gmail';

      await sendEmail('test@test.com', 'Subject', '<p>Hi</p>');

      expect(createGmailProvider).toHaveBeenCalledTimes(1);
      expect(createResendProvider).not.toHaveBeenCalled();
    });
  });

  describe('isEmailConfigured()', () => {
    it('should return true when the active provider is configured', async () => {
      const provider = mockProvider(true, { id: '1', from: 'x', to: 'y' });
      vi.mocked(createResendProvider).mockReturnValue(provider);
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.EMAIL_PROVIDER;

      const result = await isEmailConfigured();
      expect(result).toBe(true);
      expect(provider.isConfigured).toHaveBeenCalledTimes(1);
    });

    it('should return false when the active provider is not configured', async () => {
      const provider = mockProvider(false, { id: '1', from: 'x', to: 'y' });
      vi.mocked(createResendProvider).mockReturnValue(provider);
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.EMAIL_PROVIDER;

      const result = await isEmailConfigured();
      expect(result).toBe(false);
      expect(provider.isConfigured).toHaveBeenCalledTimes(1);
    });

    it('should re-evaluate after cache reset', async () => {
      const provider1 = mockProvider(false, { id: '1', from: 'x', to: 'y' });
      const provider2 = mockProvider(true, { id: '2', from: 'x', to: 'y' });
      vi.mocked(createResendProvider)
        .mockReturnValueOnce(provider1)
        .mockReturnValueOnce(provider2);
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.EMAIL_PROVIDER;

      expect(await isEmailConfigured()).toBe(false);

      resetProviderCache();

      expect(await isEmailConfigured()).toBe(true);
    });
  });

  describe('sendEmail()', () => {
    it('should send an email via the active provider and return the result', async () => {
      const sendResult: SendResult = { id: 'msg-123', from: 'findx@example.com', to: 'user@test.com' };
      const provider = mockProvider(true, sendResult);
      vi.mocked(createResendProvider).mockReturnValue(provider);
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.EMAIL_PROVIDER;

      const result = await sendEmail('user@test.com', 'Hello World', '<p>Content</p>');

      expect(result).toEqual({
        id: 'msg-123',
        from: 'findx@example.com',
        to: 'user@test.com',
      });
      expect(provider.send).toHaveBeenCalledTimes(1);
      expect(provider.send).toHaveBeenCalledWith({
        to: 'user@test.com',
        subject: 'Hello World',
        html: '<p>Content</p>',
      });
    });

    it('should return simulated result when provider returns a simulated response', async () => {
      const sendResult: SendResult = { id: 'sim-1', from: 'x@y.com', to: 'z@y.com', simulated: true };
      const provider = mockProvider(true, sendResult);
      vi.mocked(createResendProvider).mockReturnValue(provider);
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.EMAIL_PROVIDER;

      const result = await sendEmail('test@test.com', 'Subject', '<p>Hi</p>');

      expect(result.simulated).toBe(true);
      expect(result.id).toBe('sim-1');
    });

    it('should propagate errors from the provider send method', async () => {
      const provider = mockProvider(true, { id: '1', from: 'x', to: 'y' });
      vi.mocked(provider.send).mockRejectedValueOnce(new Error('SMTP connection failed'));
      vi.mocked(createResendProvider).mockReturnValue(provider);
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.EMAIL_PROVIDER;

      await expect(sendEmail('test@test.com', 'Subject', '<p>Hi</p>')).rejects.toThrow(
        'SMTP connection failed'
      );
    });

    it('should propagate errors from getStoredTokens during provider selection', async () => {
      vi.mocked(getStoredTokens).mockRejectedValueOnce(new Error('DB connection failed'));
      delete process.env.EMAIL_PROVIDER;
      process.env.GOOGLE_CLIENT_ID = 'id';
      process.env.GOOGLE_CLIENT_SECRET = 'secret';

      await expect(sendEmail('test@test.com', 'Subject', '<p>Hi</p>')).rejects.toThrow(
        'DB connection failed'
      );
    });

    it('should handle empty subject', async () => {
      const sendResult: SendResult = { id: 'msg-456', from: 'a@b.com', to: 'c@d.com' };
      const provider = mockProvider(true, sendResult);
      vi.mocked(createResendProvider).mockReturnValue(provider);
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.EMAIL_PROVIDER;

      const result = await sendEmail('c@d.com', '', '<p>Body</p>');

      expect(provider.send).toHaveBeenCalledWith({
        to: 'c@d.com',
        subject: '',
        html: '<p>Body</p>',
      });
      expect(result.id).toBe('msg-456');
    });

    it('should handle empty HTML body', async () => {
      const sendResult: SendResult = { id: 'msg-789', from: 'a@b.com', to: 'c@d.com' };
      const provider = mockProvider(true, sendResult);
      vi.mocked(createResendProvider).mockReturnValue(provider);
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.EMAIL_PROVIDER;

      const result = await sendEmail('c@d.com', 'Subject', '');

      expect(provider.send).toHaveBeenCalledWith({
        to: 'c@d.com',
        subject: 'Subject',
        html: '',
      });
      expect(result.id).toBe('msg-789');
    });

    it('should use the same provider instance for multiple calls (caching)', async () => {
      const provider = mockProvider(true, { id: '1', from: 'x', to: 'y' });
      vi.mocked(createResendProvider).mockReturnValue(provider);
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.EMAIL_PROVIDER;

      await sendEmail('a@test.com', 'First', '<p>1</p>');
      await sendEmail('b@test.com', 'Second', '<p>2</p>');
      await sendEmail('c@test.com', 'Third', '<p>3</p>');

      expect(createResendProvider).toHaveBeenCalledTimes(1);
      expect(provider.send).toHaveBeenCalledTimes(3);
    });

    it('should switch providers after cache reset', async () => {
      const resendProvider = mockProvider(true, { id: 'r', from: 'x', to: 'y' });
      const gmailProvider = mockProvider(true, { id: 'g', from: 'x', to: 'y' });
      vi.mocked(createResendProvider).mockReturnValue(resendProvider);
      vi.mocked(createGmailProvider).mockReturnValue(gmailProvider);

      // Start with Resend
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.EMAIL_PROVIDER;

      await sendEmail('a@test.com', 'First', '<p>1</p>');
      expect(createResendProvider).toHaveBeenCalledTimes(1);

      // Switch to Gmail
      resetProviderCache();
      process.env.EMAIL_PROVIDER = 'gmail';

      await sendEmail('b@test.com', 'Second', '<p>2</p>');
      expect(createGmailProvider).toHaveBeenCalledTimes(1);
    });

    it('should send via Gmail provider with correct parameters', async () => {
      const sendResult: SendResult = { id: 'gmail-001', from: 'me@gmail.com', to: 'you@test.com' };
      const gmailProvider = mockProvider(true, sendResult);
      vi.mocked(createGmailProvider).mockReturnValue(gmailProvider);
      vi.mocked(getStoredTokens).mockResolvedValue({ access_token: 'at', refresh_token: 'rt' });

      process.env.GOOGLE_CLIENT_ID = 'cid';
      process.env.GOOGLE_CLIENT_SECRET = 'csecret';

      const result = await sendEmail('you@test.com', 'Gmail Subject', '<p>Gmail Body</p>');

      expect(gmailProvider.send).toHaveBeenCalledWith({
        to: 'you@test.com',
        subject: 'Gmail Subject',
        html: '<p>Gmail Body</p>',
      });
      expect(result).toEqual({
        id: 'gmail-001',
        from: 'me@gmail.com',
        to: 'you@test.com',
      });
    });
  });
});