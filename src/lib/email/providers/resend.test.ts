import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the 'resend' module
vi.mock('resend', () => {
  const Resend = vi.fn();
  return { Resend };
});

// Import the mocked class so we can control its instances
import { Resend } from 'resend';

describe('createResendProvider', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // Helper to get a fresh provider (new module import => fresh _resend singleton)
  async function getFreshProvider() {
    const { createResendProvider } = await import('./resend.js');
    return createResendProvider();
  }

  describe('returned EmailProvider object', () => {
    it('should have the name "resend"', async () => {
      const provider = await getFreshProvider();
      expect(provider.name).toBe('resend');
    });

    describe('isConfigured()', () => {
      it('should return true when RESEND_API_KEY is set', async () => {
        process.env.RESEND_API_KEY = 're_test_key';
        const provider = await getFreshProvider();
        expect(provider.isConfigured()).toBe(true);
      });

      it('should return false when RESEND_API_KEY is undefined', async () => {
        delete process.env.RESEND_API_KEY;
        const provider = await getFreshProvider();
        expect(provider.isConfigured()).toBe(false);
      });

      it('should return false when RESEND_API_KEY is an empty string', async () => {
        process.env.RESEND_API_KEY = '';
        const provider = await getFreshProvider();
        expect(provider.isConfigured()).toBe(false);
      });
    });

    describe('send()', () => {
      const defaultParams = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
      };

      it('should simulate send and warn if RESEND_API_KEY is missing', async () => {
        delete process.env.RESEND_API_KEY;
        const provider = await getFreshProvider();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await provider.send(defaultParams);

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('RESEND_API_KEY not configured'),
        );
        expect(result.to).toBe('test@example.com');
        expect(result.from).toBe('findx@example.com');
        expect(result.id).toMatch(/^simulated_\d+_[a-z0-9]{4,}$/);
        expect(result.simulated).toBe(true);

        warnSpy.mockRestore();
      });

      it('should use EMAIL_FROM for the simulated from address if set', async () => {
        delete process.env.RESEND_API_KEY;
        process.env.EMAIL_FROM = 'custom@example.com';

        const provider = await getFreshProvider();
        const result = await provider.send(defaultParams);

        expect(result.from).toBe('custom@example.com');
      });

      it('should initialize Resend client and send email successfully', async () => {
        process.env.RESEND_API_KEY = 're_test_key';
        process.env.EMAIL_FROM = 'sender@example.com';

        const mockSend = vi.fn().mockResolvedValue({
          data: { id: 'real_email_id_123' },
        });

        (Resend as any).mockImplementation(() => ({
          emails: { send: mockSend },
        }));

        const provider = await getFreshProvider();
        const result = await provider.send(defaultParams);

        expect(Resend).toHaveBeenCalledWith('re_test_key');
        expect(mockSend).toHaveBeenCalledWith({
          from: 'sender@example.com',
          to: 'test@example.com',
          subject: 'Test Subject',
          html: '<p>Hello</p>',
        });

        expect(result.id).toBe('real_email_id_123');
        expect(result.from).toBe('sender@example.com');
        expect(result.to).toBe('test@example.com');
        expect(result.simulated).toBeUndefined();
      });

      it('should default to "findx@example.com" if EMAIL_FROM is not set', async () => {
        process.env.RESEND_API_KEY = 're_test_key';
        delete process.env.EMAIL_FROM;

        const mockSend = vi.fn().mockResolvedValue({ data: { id: 'id' } });
        (Resend as any).mockImplementation(() => ({
          emails: { send: mockSend },
        }));

        const provider = await getFreshProvider();
        await provider.send(defaultParams);

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({ from: 'findx@example.com' }),
        );
      });

      it('should fallback to "unknown" id if API returns no data', async () => {
        process.env.RESEND_API_KEY = 're_test_key';

        const mockSend = vi.fn().mockResolvedValue({ data: null });
        (Resend as any).mockImplementation(() => ({
          emails: { send: mockSend },
        }));

        const provider = await getFreshProvider();
        const result = await provider.send(defaultParams);

        expect(result.id).toBe('unknown');
      });

      it('should pass an array of "to" addresses properly to the Resend client', async () => {
        process.env.RESEND_API_KEY = 're_test_key';

        const arrayParams = {
          to: ['one@example.com', 'two@example.com'],
          subject: 'Multi Test',
          html: '<p>Hi</p>',
        };

        const mockSend = vi.fn().mockResolvedValue({ data: { id: 'multi_id' } });
        (Resend as any).mockImplementation(() => ({
          emails: { send: mockSend },
        }));

        const provider = await getFreshProvider();
        const result = await provider.send(arrayParams);

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({ to: ['one@example.com', 'two@example.com'] }),
        );
        expect(result.to).toEqual(['one@example.com', 'two@example.com']);
      });

      it('should propagate errors thrown by the Resend client', async () => {
        process.env.RESEND_API_KEY = 're_test_key';

        const error = new Error('Network Error');
        const mockSend = vi.fn().mockRejectedValue(error);
        (Resend as any).mockImplementation(() => ({
          emails: { send: mockSend },
        }));

        const provider = await getFreshProvider();
        await expect(provider.send(defaultParams)).rejects.toThrow('Network Error');
      });

      it('should reuse the same Resend client instance across multiple sends', async () => {
        process.env.RESEND_API_KEY = 're_test_key';

        const mockSend = vi.fn().mockResolvedValue({ data: { id: 'id' } });
        (Resend as any).mockImplementation(() => ({
          emails: { send: mockSend },
        }));

        const provider = await getFreshProvider();
        await provider.send(defaultParams);
        await provider.send(defaultParams);

        // Constructor should only be called once because of singleton pattern
        expect(Resend).toHaveBeenCalledTimes(1);
      });
    });
  });
});
