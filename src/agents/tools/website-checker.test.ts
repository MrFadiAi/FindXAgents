import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkWebsiteTool } from './website-checker';
import type { WebsiteCheckResult } from '../../modules/discovery/website-checker.js';

vi.mock('../../modules/discovery/website-checker.js', () => ({
  checkWebsite: vi.fn(),
}));

import { checkWebsite } from '../../modules/discovery/website-checker.js';

describe('checkWebsiteTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('tool metadata', () => {
    it('should have the correct tool name', () => {
      expect(checkWebsiteTool.name).toBe('check_website');
    });

    it('should have a non-empty description', () => {
      expect(checkWebsiteTool.description).toBeTruthy();
      expect(typeof checkWebsiteTool.description).toBe('string');
    });

    it('should describe the possible return statuses in the description', () => {
      expect(checkWebsiteTool.description).toContain('active');
      expect(checkWebsiteTool.description).toContain('redirect');
      expect(checkWebsiteTool.description).toContain('error');
      expect(checkWebsiteTool.description).toContain('none');
    });

    it('should define input_schema as an object type', () => {
      expect(checkWebsiteTool.input_schema.type).toBe('object');
    });

    it('should define url as a required string property in input_schema', () => {
      expect(checkWebsiteTool.input_schema.properties.url).toEqual({
        type: 'string',
        description: 'The URL to check',
      });
      expect(checkWebsiteTool.input_schema.required).toContain('url');
    });

    it('should specify url as the only required field', () => {
      expect(checkWebsiteTool.input_schema.required).toEqual(['url']);
    });
  });

  describe('execute', () => {
    it('should return a JSON-stringified active result for a valid URL', async () => {
      const mockResult: WebsiteCheckResult = {
        status: 'active',
        statusCode: 200,
        url: 'https://example.com',
      };
      vi.mocked(checkWebsite).mockResolvedValue(mockResult);

      const output = await checkWebsiteTool.execute({ url: 'https://example.com' });

      expect(output).toBe(JSON.stringify(mockResult));
      expect(checkWebsite).toHaveBeenCalledWith('https://example.com');
    });

    it('should return a JSON-stringified redirect result', async () => {
      const mockResult: WebsiteCheckResult = {
        status: 'redirect',
        statusCode: 301,
        url: 'http://example.com',
        redirectUrl: 'https://example.com',
      };
      vi.mocked(checkWebsite).mockResolvedValue(mockResult);

      const output = await checkWebsiteTool.execute({ url: 'http://example.com' });

      expect(output).toBe(JSON.stringify(mockResult));
      expect(checkWebsite).toHaveBeenCalledWith('http://example.com');
    });

    it('should return a JSON-stringified error result', async () => {
      const mockResult: WebsiteCheckResult = {
        status: 'error',
        statusCode: 500,
        url: 'https://example.com',
        error: 'Internal Server Error',
      };
      vi.mocked(checkWebsite).mockResolvedValue(mockResult);

      const output = await checkWebsiteTool.execute({ url: 'https://example.com' });

      expect(output).toBe(JSON.stringify(mockResult));
      expect(checkWebsite).toHaveBeenCalledWith('https://example.com');
    });

    it('should return a JSON-stringified none result when site does not resolve', async () => {
      const mockResult: WebsiteCheckResult = {
        status: 'none',
        url: 'https://nonexistent.invalid',
      };
      vi.mocked(checkWebsite).mockResolvedValue(mockResult);

      const output = await checkWebsiteTool.execute({ url: 'https://nonexistent.invalid' });

      expect(output).toBe(JSON.stringify(mockResult));
      expect(checkWebsite).toHaveBeenCalledWith('https://nonexistent.invalid');
    });

    it('should pass the url as a string to checkWebsite even if input has extra properties', async () => {
      const mockResult: WebsiteCheckResult = { status: 'active', statusCode: 200, url: 'https://example.com' };
      vi.mocked(checkWebsite).mockResolvedValue(mockResult);

      const input = { url: 'https://example.com', extra: 'data', foo: 42 };
      await checkWebsiteTool.execute(input);

      expect(checkWebsite).toHaveBeenCalledWith('https://example.com');
    });

    it('should handle malformed URL gracefully by delegating to checkWebsite', async () => {
      const mockResult: WebsiteCheckResult = {
        status: 'error',
        url: 'not-a-valid-url',
        error: 'Invalid URL',
      };
      vi.mocked(checkWebsite).mockResolvedValue(mockResult);

      const output = await checkWebsiteTool.execute({ url: 'not-a-valid-url' });

      expect(output).toBe(JSON.stringify(mockResult));
      expect(checkWebsite).toHaveBeenCalledWith('not-a-valid-url');
    });

    it('should handle empty string URL by delegating to checkWebsite', async () => {
      const mockResult: WebsiteCheckResult = {
        status: 'error',
        url: '',
        error: 'Empty URL',
      };
      vi.mocked(checkWebsite).mockResolvedValue(mockResult);

      const output = await checkWebsiteTool.execute({ url: '' });

      expect(output).toBe(JSON.stringify(mockResult));
      expect(checkWebsite).toHaveBeenCalledWith('');
    });

    it('should propagate errors thrown by checkWebsite', async () => {
      vi.mocked(checkWebsite).mockRejectedValue(new Error('Network failure'));

      await expect(
        checkWebsiteTool.execute({ url: 'https://example.com' })
      ).rejects.toThrow('Network failure');

      expect(checkWebsite).toHaveBeenCalledWith('https://example.com');
    });

    it('should propagate non-Error exceptions thrown by checkWebsite', async () => {
      vi.mocked(checkWebsite).mockRejectedValue('string error');

      await expect(
        checkWebsiteTool.execute({ url: 'https://example.com' })
      ).rejects.toBe('string error');
    });

    it('should cast undefined url to string "undefined"', async () => {
      const mockResult: WebsiteCheckResult = {
        status: 'error',
        url: 'undefined',
        error: 'Invalid URL',
      };
      vi.mocked(checkWebsite).mockResolvedValue(mockResult);

      await checkWebsiteTool.execute({});

      expect(checkWebsite).toHaveBeenCalledWith(undefined);
    });

    it('should call checkWebsite exactly once per execution', async () => {
      vi.mocked(checkWebsite).mockResolvedValue({ status: 'active', statusCode: 200, url: 'https://example.com' });

      await checkWebsiteTool.execute({ url: 'https://example.com' });

      expect(checkWebsite).toHaveBeenCalledTimes(1);
    });

    it('should return valid JSON that can be parsed back to the original object', async () => {
      const mockResult: WebsiteCheckResult = {
        status: 'redirect',
        statusCode: 302,
        url: 'http://old.example.com',
        redirectUrl: 'https://new.example.com',
      };
      vi.mocked(checkWebsite).mockResolvedValue(mockResult);

      const output = await checkWebsiteTool.execute({ url: 'http://old.example.com' });

      expect(() => JSON.parse(output)).not.toThrow();
      expect(JSON.parse(output)).toEqual(mockResult);
    });

    it('should return a string from execute', async () => {
      vi.mocked(checkWebsite).mockResolvedValue({ status: 'active', statusCode: 200, url: 'https://example.com' });

      const output = await checkWebsiteTool.execute({ url: 'https://example.com' });

      expect(typeof output).toBe('string');
    });
  });
});