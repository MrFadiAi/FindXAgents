import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  sendTelegramNotification,
  testTelegramConnection,
  getDefaultTelegramConfig,
} from './telegram.js';

describe('sendTelegramNotification', () => {
  const config = { botToken: '123456:ABC-DEF', chatId: '987654321' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error when botToken is missing', async () => {
    const result = await sendTelegramNotification(
      { botToken: '', chatId: '123' },
      { type: 'sent', leadEmail: 'test@test.com' }
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('Telegram configuration missing');
  });

  it('should return error when chatId is missing', async () => {
    const result = await sendTelegramNotification(
      { botToken: 'token', chatId: '' },
      { type: 'sent', leadEmail: 'test@test.com' }
    );
    expect(result.success).toBe(false);
  });

  it('should call Telegram API with correct URL and payload', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: true }),
    });

    await sendTelegramNotification(config, {
      type: 'sent',
      leadEmail: 'lead@example.com',
      leadName: 'John',
      company: 'Acme',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bot123456:ABC-DEF/sendMessage',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.chat_id).toBe('987654321');
    expect(body.parse_mode).toBe('Markdown');
    expect(body.text).toContain('Email Sent');
    // escapeMarkdown also escapes . so lead@example.com becomes lead@example\.com
    expect(body.text).toContain('lead@example\\.com');
  });

  it('should escape Markdown special characters in user data', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: true }),
    });

    await sendTelegramNotification(config, {
      type: 'sent',
      leadEmail: 'test_important@test.com',
      leadName: 'ACME_Corp [test]',
      company: 'Test *Company*',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // Verify the escaped characters are present in the message
    // escapeMarkdown escapes _ * [ ] . and other Telegram special chars
    expect(body.text).toContain('test\\_important@test\\.com');
    expect(body.text).toContain('ACME\\_Corp \\[test\\]');
    expect(body.text).toContain('Test \\*Company\\*');
  });

  it('should return success when API responds ok', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: true }),
    });

    const result = await sendTelegramNotification(config, {
      type: 'sent',
      leadEmail: 'test@test.com',
    });

    expect(result.success).toBe(true);
  });

  it('should return error when API responds not ok', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: false, description: 'Bad Request: chat not found' }),
    });

    const result = await sendTelegramNotification(config, {
      type: 'sent',
      leadEmail: 'test@test.com',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Bad Request: chat not found');
  });

  it('should handle network errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network timeout'));

    const result = await sendTelegramNotification(config, {
      type: 'sent',
      leadEmail: 'test@test.com',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network timeout');
  });

  it('should handle non-Error thrown values', async () => {
    mockFetch.mockRejectedValue('string error');

    const result = await sendTelegramNotification(config, {
      type: 'sent',
      leadEmail: 'test@test.com',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown error');
  });

  it('should omit optional fields when not provided', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: true }),
    });

    await sendTelegramNotification(config, {
      type: 'bounce',
      leadEmail: 'test@test.com',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).not.toContain('Name:');
    expect(body.text).not.toContain('Company:');
    expect(body.text).not.toContain('Info:');
    expect(body.text).toContain('Email Bounced');
  });
});

describe('testTelegramConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delegate to sendTelegramNotification with test payload', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: true }),
    });

    const result = await testTelegramConnection({
      botToken: 'test-token',
      chatId: 'test-chat',
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('getDefaultTelegramConfig', () => {
  const originalBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatId = process.env.TELEGRAM_CHAT_ID;

  afterEach(() => {
    if (originalBotToken) {
      process.env.TELEGRAM_BOT_TOKEN = originalBotToken;
    } else {
      delete process.env.TELEGRAM_BOT_TOKEN;
    }
    if (originalChatId) {
      process.env.TELEGRAM_CHAT_ID = originalChatId;
    } else {
      delete process.env.TELEGRAM_CHAT_ID;
    }
  });

  it('should return config when env vars are set', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'env-token';
    process.env.TELEGRAM_CHAT_ID = 'env-chat-id';

    const config = getDefaultTelegramConfig();
    expect(config).not.toBeNull();
    expect(config!.botToken).toBe('env-token');
    expect(config!.chatId).toBe('env-chat-id');
  });

  it('should return null when env vars are not set', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    const config = getDefaultTelegramConfig();
    expect(config).toBeNull();
  });

  it('should return null when only botToken is set', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'token-only';
    delete process.env.TELEGRAM_CHAT_ID;

    const config = getDefaultTelegramConfig();
    expect(config).toBeNull();
  });
});
