import { describe, it, expect, vi } from 'vitest';
import type { SendParams, SendResult, EmailProvider } from './types';

describe('SendParams interface', () => {
  it('should allow valid SendParams with required properties', () => {
    const params: SendParams = {
      to: 'test@example.com',
      subject: 'Test Subject',
      html: '<p>Hello World</p>',
    };
    expect(params.to).toBeTypeOf('string');
    expect(params.subject).toBeTypeOf('string');
    expect(params.html).toBeTypeOf('string');
    expect(params.text).toBeUndefined();
  });

  it('should allow optional text property', () => {
    const params: SendParams = {
      to: 'test@example.com',
      subject: 'Test Subject',
      html: '<p>Hello World</p>',
      text: 'Hello World',
    };
    expect(params.text).toBe('Hello World');
  });

  it('should handle empty strings for required fields', () => {
    const params: SendParams = {
      to: '',
      subject: '',
      html: '',
    };
    expect(params.to).toBe('');
    expect(params.subject).toBe('');
    expect(params.html).toBe('');
  });

  it('should handle unicode and special characters', () => {
    const params: SendParams = {
      to: 'ユーザー@example.jp',
      subject: '🎉 Special "Offers" & More!',
      html: '<p>Ünïcödé — em dash</p>',
      text: 'Plain text version 🚀',
    };
    expect(params.to).toContain('ユーザー');
    expect(params.subject).toContain('🎉');
    expect(params.html).toContain('Ünïcödé');
    expect(params.text).toContain('🚀');
  });

  it('should handle very long email addresses', () => {
    const longLocal = 'a'.repeat(64);
    const longDomain = 'b'.repeat(63);
    const params: SendParams = {
      to: `${longLocal}@${longDomain}.com`,
      subject: 'Test',
      html: '<p>Test</p>',
    };
    expect(params.to.length).toBeGreaterThan(100);
  });

  it('should handle very long subjects', () => {
    const params: SendParams = {
      to: 'test@example.com',
      subject: 'A'.repeat(998),
      html: '<p>Test</p>',
    };
    expect(params.subject.length).toBe(998);
  });

  it('should handle large HTML body', () => {
    const largeHtml = '<div>' + '<p>Content</p>'.repeat(10000) + '</div>';
    const params: SendParams = {
      to: 'test@example.com',
      subject: 'Test',
      html: largeHtml,
    };
    expect(params.html.length).toBeGreaterThan(100000);
  });
});

describe('SendResult interface', () => {
  it('should allow valid SendResult with required properties', () => {
    const result: SendResult = {
      id: 'msg-123',
      from: 'sender@example.com',
      to: 'recipient@example.com',
    };
    expect(result.id).toBeTypeOf('string');
    expect(result.from).toBeTypeOf('string');
    expect(result.to).toBeTypeOf('string');
    expect(result.simulated).toBeUndefined();
  });

  it('should allow optional simulated property set to true', () => {
    const result: SendResult = {
      id: 'sim-456',
      from: 'noreply@test.com',
      to: 'user@test.com',
      simulated: true,
    };
    expect(result.simulated).toBe(true);
  });

  it('should allow optional simulated property set to false', () => {
    const result: SendResult = {
      id: 'real-789',
      from: 'noreply@test.com',
      to: 'user@test.com',
      simulated: false,
    };
    expect(result.simulated).toBe(false);
  });

  it('should handle UUID-style IDs', () => {
    const result: SendResult = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      from: 'from@test.com',
      to: 'to@test.com',
    };
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('should handle empty strings for all fields', () => {
    const result: SendResult = {
      id: '',
      from: '',
      to: '',
      simulated: true,
    };
    expect(result.id).toBe('');
    expect(result.from).toBe('');
    expect(result.to).toBe('');
  });
});

describe('EmailProvider interface', () => {
  const createResendProvider = (): EmailProvider => ({
    name: 'resend',
    isConfigured: vi.fn().mockReturnValue(true),
    send: vi.fn().mockResolvedValue({
      id: 'resend-123',
      from: 'noreply@findx.com',
      to: 'prospect@example.com',
    }),
  });

  const createGmailProvider = (): EmailProvider => ({
    name: 'gmail',
    isConfigured: vi.fn().mockReturnValue(true),
    send: vi.fn().mockResolvedValue({
      id: 'gmail-456',
      from: 'me@gmail.com',
      to: 'lead@example.com',
    }),
  });

  describe('provider with name "resend"', () => {
    it('should have name "resend"', () => {
      const provider = createResendProvider();
      expect(provider.name).toBe('resend');
    });

    it('should implement isConfigured returning boolean', () => {
      const provider = createResendProvider();
      expect(provider.isConfigured()).toBe(true);
      expect(provider.isConfigured).toHaveBeenCalledTimes(1);
    });

    it('should implement send returning a Promise<SendResult>', async () => {
      const provider = createResendProvider();
      const params: SendParams = {
        to: 'prospect@example.com',
        subject: 'Outreach',
        html: '<p>Hi!</p>',
      };
      const result = await provider.send(params);
      expect(result).toEqual({
        id: 'resend-123',
        from: 'noreply@findx.com',
        to: 'prospect@example.com',
      });
      expect(provider.send).toHaveBeenCalledWith(params);
    });

    it('should support isConfigured returning false', () => {
      const provider = createResendProvider();
      (provider.isConfigured as ReturnType<typeof vi.fn>).mockReturnValue(false);
      expect(provider.isConfigured()).toBe(false);
    });

    it('should support send rejecting with an error', async () => {
      const provider = createResendProvider();
      (provider.send as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('API key invalid')
      );
      await expect(
        provider.send({ to: 'x@x.com', subject: 'Test', html: '<p>Test</p>' })
      ).rejects.toThrow('API key invalid');
    });
  });

  describe('provider with name "gmail"', () => {
    it('should have name "gmail"', () => {
      const provider = createGmailProvider();
      expect(provider.name).toBe('gmail');
    });

    it('should implement isConfigured returning boolean', () => {
      const provider = createGmailProvider();
      expect(provider.isConfigured()).toBe(true);
    });

    it('should implement send returning a Promise<SendResult>', async () => {
      const provider = createGmailProvider();
      const params: SendParams = {
        to: 'lead@example.com',
        subject: 'Follow-up',
        html: '<p>Checking in</p>',
        text: 'Checking in',
      };
      const result = await provider.send(params);
      expect(result).toEqual({
        id: 'gmail-456',
        from: 'me@gmail.com',
        to: 'lead@example.com',
      });
    });

    it('should support send returning simulated result', async () => {
      const provider = createGmailProvider();
      (provider.send as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'sim-001',
        from: 'me@gmail.com',
        to: 'test@test.com',
        simulated: true,
      });
      const result = await provider.send({
        to: 'test@test.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });
      expect(result.simulated).toBe(true);
    });
  });

  describe('structural conformance', () => {
    it('should only accept "resend" or "gmail" as name', () => {
      const validNames: Array<EmailProvider['name']> = ['resend', 'gmail'];
      expect(validNames).toContain('resend');
      expect(validNames).toContain('gmail');
      expect(validNames.length).toBe(2);
    });

    it('isConfigured should be callable with no arguments', () => {
      const provider = createResendProvider();
      expect(() => provider.isConfigured()).not.toThrow();
    });

    it('send should accept SendParams with optional text field', async () => {
      const provider = createResendProvider();
      const paramsWithText: SendParams = {
        to: 'a@b.com',
        subject: 'S',
        html: '<p>H</p>',
        text: 'H',
      };
      const paramsWithoutText: SendParams = {
        to: 'a@b.com',
        subject: 'S',
        html: '<p>H</p>',
      };
      await provider.send(paramsWithText);
      await provider.send(paramsWithoutText);
      expect(provider.send).toHaveBeenCalledTimes(2);
    });

    it('send result should always contain required id, from, to', async () => {
      const provider = createResendProvider();
      const result = await provider.send({
        to: 'x@y.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      });
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('from');
      expect(result).toHaveProperty('to');
    });

    it('provider should handle boundary email addresses with special characters', async () => {
      const provider = createGmailProvider();
      const params: SendParams = {
        to: '"John O\'Brien" <john.obrien+tag@sub.domain.co.uk>',
        subject: 'Hello "John"',
        html: '<p>Hi & welcome</p>',
      };
      await provider.send(params);
      expect(provider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '"John O\'Brien" <john.obrien+tag@sub.domain.co.uk>',
        })
      );
    });

    it('provider should handle multiple sequential sends', async () => {
      const provider = createResendProvider();
      const calls = Array.from({ length: 50 }, (_, i) =>
        provider.send({
          to: `user${i}@example.com`,
          subject: `Email ${i}`,
          html: `<p>Body ${i}</p>`,
        })
      );
      const results = await Promise.all(calls);
      expect(results).toHaveLength(50);
      expect(provider.send).toHaveBeenCalledTimes(50);
    });
  });
});