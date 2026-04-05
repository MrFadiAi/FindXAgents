import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendEmailTool } from './email-send';

// Mock the email client
vi.mock('../../lib/email/client.js', () => ({
  sendEmail: vi.fn(),
}));

// Import the mocked function
import { sendEmail } from '../../lib/email/client.js';

const mockSendEmail = vi.mocked(sendEmail);

describe('sendEmailTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('tool metadata', () => {
    it('should have the correct tool name', () => {
      expect(sendEmailTool.name).toBe('send_email');
    });

    it('should have a description that mentions approval', () => {
      expect(sendEmailTool.description).toContain('explicitly approved');
    });

    it('should have an object input_schema', () => {
      expect(sendEmailTool.input_schema.type).toBe('object');
    });

    it('should require to, subject, and html fields', () => {
      expect(sendEmailTool.input_schema.required).toEqual(['to', 'subject', 'html']);
    });

    it('should define to property as string with description', () => {
      const toProp = sendEmailTool.input_schema.properties['to'];
      expect(toProp).toEqual({
        type: 'string',
        description: 'Recipient email address',
      });
    });

    it('should define subject property as string with description', () => {
      const subjectProp = sendEmailTool.input_schema.properties['subject'];
      expect(subjectProp).toEqual({
        type: 'string',
        description: 'Email subject line',
      });
    });

    it('should define html property as string with description', () => {
      const htmlProp = sendEmailTool.input_schema.properties['html'];
      expect(htmlProp).toEqual({
        type: 'string',
        description: 'HTML body of the email',
      });
    });

    it('should define exactly 3 properties', () => {
      const keys = Object.keys(sendEmailTool.input_schema.properties);
      expect(keys).toHaveLength(3);
      expect(keys).toContain('to');
      expect(keys).toContain('subject');
      expect(keys).toContain('html');
    });
  });

  describe('execute', () => {
    it('should call sendEmail with correct arguments', async () => {
      mockSendEmail.mockResolvedValueOnce({ messageId: 'msg-123' });
      const input = {
        to: 'prospect@example.com',
        subject: 'Quick Follow Up',
        html: '<p>Hi there!</p>',
      };

      await sendEmailTool.execute(input);

      expect(mockSendEmail).toHaveBeenCalledOnce();
      expect(mockSendEmail).toHaveBeenCalledWith(
        'prospect@example.com',
        'Quick Follow Up',
        '<p>Hi there!</p>'
      );
    });

    it('should return success response with stringified result', async () => {
      mockSendEmail.mockResolvedValueOnce({ id: 'abc-123' });
      const input = {
        to: 'test@test.com',
        subject: 'Hello',
        html: '<h1>World</h1>',
      };

      const result = await sendEmailTool.execute(input);

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(true);
      expect(parsed.result).toBe('[object Object]');
    });

    it('should return success response when sendEmail returns a string', async () => {
      mockSendEmail.mockResolvedValueOnce('sent-message-id');

      const result = await sendEmailTool.execute({
        to: 'user@test.com',
        subject: 'Test',
        html: '<p>Body</p>',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(true);
      expect(parsed.result).toBe('sent-message-id');
    });

    it('should return success response when sendEmail returns null', async () => {
      mockSendEmail.mockResolvedValueOnce(null);

      const result = await sendEmailTool.execute({
        to: 'a@b.com',
        subject: 'Sub',
        html: '<br>',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(true);
      expect(parsed.result).toBe('null');
    });

    it('should return success response when sendEmail returns undefined', async () => {
      mockSendEmail.mockResolvedValueOnce(undefined);

      const result = await sendEmailTool.execute({
        to: 'a@b.com',
        subject: 'Sub',
        html: '<br>',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(true);
      expect(parsed.result).toBe('undefined');
    });

    it('should return success response when sendEmail returns a number', async () => {
      mockSendEmail.mockResolvedValueOnce(200);

      const result = await sendEmailTool.execute({
        to: 'a@b.com',
        subject: 'Sub',
        html: '<br>',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(true);
      expect(parsed.result).toBe('200');
    });

    it('should return success response when sendEmail returns a boolean', async () => {
      mockSendEmail.mockResolvedValueOnce(true);

      const result = await sendEmailTool.execute({
        to: 'a@b.com',
        subject: 'Sub',
        html: '<br>',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(true);
      expect(parsed.result).toBe('true');
    });

    it('should handle error thrown by sendEmail with Error instance', async () => {
      const error = new Error('SMTP connection refused');
      mockSendEmail.mockRejectedValueOnce(error);

      const result = await sendEmailTool.execute({
        to: 'fail@smtp.com',
        subject: 'Will Fail',
        html: '<p>Oops</p>',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('SMTP connection refused');
    });

    it('should handle error thrown by sendEmail with string error', async () => {
      mockSendEmail.mockRejectedValueOnce('Rate limit exceeded');

      const result = await sendEmailTool.execute({
        to: 'fail@smtp.com',
        subject: 'Will Fail',
        html: '<p>Oops</p>',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Rate limit exceeded');
    });

    it('should handle error thrown by sendEmail with non-Error object', async () => {
      mockSendEmail.mockRejectedValueOnce({ code: 'ETIMEOUT' });

      const result = await sendEmailTool.execute({
        to: 'timeout@smtp.com',
        subject: 'Timeout',
        html: '<p>Slow</p>',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('[object Object]');
    });

    it('should handle error thrown with number value', async () => {
      mockSendEmail.mockRejectedValueOnce(500);

      const result = await sendEmailTool.execute({
        to: 'err@test.com',
        subject: 'Err',
        html: '<p>Test</p>',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('500');
    });

    it('should handle error thrown with null value', async () => {
      mockSendEmail.mockRejectedValueOnce(null);

      const result = await sendEmailTool.execute({
        to: 'err@test.com',
        subject: 'Err',
        html: '<p>Test</p>',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('null');
    });

    it('should handle error thrown with undefined value', async () => {
      mockSendEmail.mockRejectedValueOnce(undefined);

      const result = await sendEmailTool.execute({
        to: 'err@test.com',
        subject: 'Err',
        html: '<p>Test</p>',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('undefined');
    });

    it('should cast input values to strings', async () => {
      mockSendEmail.mockResolvedValueOnce('ok');

      // The execute function uses `as string` casts
      const input = {
        to: 12345,
        subject: null,
        html: undefined,
      } as unknown as Record<string, unknown>;

      await sendEmailTool.execute(input);

      expect(mockSendEmail).toHaveBeenCalledWith(12345, null, undefined);
    });

    it('should handle empty strings for all fields', async () => {
      mockSendEmail.mockResolvedValueOnce('ok');

      const result = await sendEmailTool.execute({
        to: '',
        subject: '',
        html: '',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledWith('', '', '');
    });

    it('should handle email with special characters in subject', async () => {
      mockSendEmail.mockResolvedValueOnce('ok');

      const result = await sendEmailTool.execute({
        to: 'user@exämple.com',
        subject: 'Re: "Quoted" <Subject> & More',
        html: '<p>Test</p>',
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledWith(
        'user@exämple.com',
        'Re: "Quoted" <Subject> & More',
        '<p>Test</p>'
      );
    });

    it('should handle large HTML body', async () => {
      mockSendEmail.mockResolvedValueOnce('ok');

      const largeHtml = '<p>' + 'A'.repeat(100000) + '</p>';

      const result = await sendEmailTool.execute({
        to: 'user@test.com',
        subject: 'Big Email',
        html: largeHtml,
      });

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(true);
    });

    it('should always return a JSON string on success', async () => {
      mockSendEmail.mockResolvedValueOnce('msg-id');

      const result = await sendEmailTool.execute({
        to: 'a@b.com',
        subject: 'Sub',
        html: '<p>Hello</p>',
      });

      expect(typeof result).toBe('string');
      expect(() => JSON.parse(result as string)).not.toThrow();
    });

    it('should always return a JSON string on error', async () => {
      mockSendEmail.mockRejectedValueOnce(new Error('fail'));

      const result = await sendEmailTool.execute({
        to: 'a@b.com',
        subject: 'Sub',
        html: '<p>Hello</p>',
      });

      expect(typeof result).toBe('string');
      expect(() => JSON.parse(result as string)).not.toThrow();
    });
  });
});