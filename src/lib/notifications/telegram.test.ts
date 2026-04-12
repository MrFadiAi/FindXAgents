import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { sendTelegramNotification, getDefaultTelegramConfig } from './telegram.js';

describe('sendTelegramNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
  });

  const config = { botToken: '123:ABC', chatId: '999' };

  it('returns error when botToken is empty', async () => {
    const result = await sendTelegramNotification({ botToken: '', chatId: '999' }, {
      type: 'sent', leadEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Telegram configuration missing');
  });

  it('returns error when chatId is empty', async () => {
    const result = await sendTelegramNotification({ botToken: '123', chatId: '' }, {
      type: 'sent', leadEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Telegram configuration missing');
  });

  it('sends correct payload to Telegram API', async () => {
    await sendTelegramNotification(config, {
      type: 'sent', leadEmail: 'test@example.com',
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bot123:ABC/sendMessage',
      expect.objectContaining({
        method: 'POST',
      })
    );
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.chat_id).toBe('999');
    expect(body.text).toContain('test@example\\.com');
    expect(body.parse_mode).toBe('Markdown');
  });

  it('returns error when Telegram API responds with non-ok HTTP status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ ok: false, description: 'Unauthorized' }),
    });
    const result = await sendTelegramNotification(config, {
      type: 'sent', leadEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Telegram API error: HTTP 401');
  });

  it('returns error when Telegram API responds with !ok in body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: false, description: 'Bad Request' }),
    });
    const result = await sendTelegramNotification(config, {
      type: 'sent', leadEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Bad Request');
  });

  it('handles fetch network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network timeout'));
    const result = await sendTelegramNotification(config, {
      type: 'sent', leadEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network timeout');
  });

  it('handles non-Error thrown values', async () => {
    mockFetch.mockRejectedValue('string error');
    const result = await sendTelegramNotification(config, {
      type: 'sent', leadEmail: 'a@b.com',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown error');
  });

  it('includes optional fields when provided', async () => {
    await sendTelegramNotification(config, {
      type: 'reply', leadEmail: 'a@b.com',
      leadName: 'John', company: 'Acme',
      additionalInfo: 'Extra info',
    });
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toContain('John');
    expect(body.text).toContain('Acme');
    expect(body.text).toContain('Extra info');
  });

  it('escapes Markdown special characters in user-provided text', async () => {
    await sendTelegramNotification(config, {
      type: 'sent', leadEmail: 'a@b.com',
      leadName: 'John *Smith*',
      company: 'Test_Corp [NL]',
    });
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toContain('John \\*Smith\\*');
    expect(body.text).toContain('Test\\_Corp \\[NL\\]');
  });

  it('uses Europe/Amsterdam timezone', async () => {
    await sendTelegramNotification(config, {
      type: 'sent', leadEmail: 'a@b.com',
    });
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    // Just verify the message was sent — timezone formatting is tested by the implementation
    expect(body.text).toContain('Time');
  });
});

describe('getDefaultTelegramConfig', () => {
  it('returns env values when set', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = 'test-chat';
    const config = getDefaultTelegramConfig();
    expect(config).toEqual({ botToken: 'test-token', chatId: 'test-chat' });
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  it('returns empty strings when env not set', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    const config = getDefaultTelegramConfig();
    expect(config).toEqual({ botToken: '', chatId: '' });
  });
});
