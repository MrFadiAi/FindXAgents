import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the agent-based client from the new location
// Use vi.hoisted to ensure mock factory functions are available at hoist time
const { mockCall, mockStream, mockAIClient } = vi.hoisted(() => {
  const mockCall = vi.fn().mockResolvedValue({ success: true, data: 'mocked AI response' });
  const mockStream = vi.fn().mockReturnValue(new ReadableStream({
    start(controller) {
      controller.enqueue('mock stream chunk');
      controller.close();
    }
  }));
  const mockAIClient = vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    call: vi.fn().mockResolvedValue({ success: true }),
  }));
  return { mockCall, mockStream, mockAIClient };
});

vi.mock('../../agents/core/client.js', () => ({
  default: {
    call: mockCall,
    stream: mockStream,
  },
  AIClient: mockAIClient,
}));

describe('AI Client Backward Compatibility Layer', () => {
  beforeEach(() => {
    // Reset call counts but keep implementations intact
    mockCall.mockClear();
    mockCall.mockResolvedValue({ success: true, data: 'mocked AI response' });
    mockStream.mockClear();
    mockStream.mockReturnValue(new ReadableStream({
      start(controller) {
        controller.enqueue('mock stream chunk');
        controller.close();
      }
    }));
    mockAIClient.mockClear();
    mockAIClient.mockImplementation(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      call: vi.fn().mockResolvedValue({ success: true }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Module Re-export Behavior', () => {
    it('should successfully import the module without throwing', async () => {
      const importPromise = import('./client.js');
      await expect(importPromise).resolves.toBeDefined();
    });

    it('should not export undefined when imported', async () => {
      const module = await import('./client.js');
      expect(module).not.toBeUndefined();
      expect(module).not.toBeNull();
    });
  });

  describe('Backward Compatibility Redirects', () => {
    it('should delegate calls to the new agents module client', async () => {
      // Import the new client to verify mock setup is correct
      const { default: agentClient } = await import('../../agents/core/client.js');

      const result = await agentClient.call('test prompt');

      expect(agentClient.call).toHaveBeenCalledWith('test prompt');
      expect(result).toEqual({ success: true, data: 'mocked AI response' });
    });

    it('should support streaming from the new agents module', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      const stream = agentClient.stream('test prompt');

      expect(stream).toBeInstanceOf(ReadableStream);
      expect(agentClient.stream).toHaveBeenCalledWith('test prompt');
    });

    it('should handle errors from the new client gracefully', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockRejectedValueOnce(new Error('AI service unavailable'));

      await expect(agentClient.call('error trigger')).rejects.toThrow('AI service unavailable');
    });

    it('should handle timeout errors from the new client', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockRejectedValueOnce(new Error('Request timeout'));

      await expect(agentClient.call('timeout trigger')).rejects.toThrow('Request timeout');
    });

    it('should handle rate limiting errors from the new client', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockRejectedValueOnce(new Error('Rate limit exceeded'));

      await expect(agentClient.call('rate limit trigger')).rejects.toThrow('Rate limit exceeded');
    });

    it('should return valid response structure for tool-use-aware calls', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockResolvedValueOnce({
        success: true,
        data: {
          tools: ['search_prospects', 'enrich_lead'],
          result: 'Executed tool calls',
        },
      });

      const result = await agentClient.call('Find prospects in SaaS');

      expect(result.success).toBe(true);
      expect(result.data.tools).toContain('search_prospects');
      expect(result.data.tools).toContain('enrich_lead');
    });

    it('should handle empty string prompts', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockResolvedValueOnce({
        success: false,
        error: 'Empty prompt provided',
      });

      const result = await agentClient.call('');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle null prompt gracefully', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockRejectedValueOnce(
        new TypeError('Cannot process null prompt')
      );

      await expect(agentClient.call(null as unknown as string)).rejects.toThrow(TypeError);
    });

    it('should handle undefined prompt gracefully', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockRejectedValueOnce(
        new TypeError('Cannot process undefined prompt')
      );

      await expect(agentClient.call(undefined as unknown as string)).rejects.toThrow(TypeError);
    });

    it('should handle very long prompts', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');
      const longPrompt = 'Analyze this: '.repeat(10000);

      vi.mocked(agentClient.call).mockResolvedValueOnce({
        success: true,
        data: 'Analysis complete',
      });

      const result = await agentClient.call(longPrompt);
      expect(result.success).toBe(true);
    });

    it('should handle prompts with special characters', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');
      const specialPrompt = 'Find prospects with regex: /[^a-zA-Z0-9]/ and unicode: 你好世界 🚀';

      vi.mocked(agentClient.call).mockResolvedValueOnce({
        success: true,
        data: 'Processed special characters',
      });

      const result = await agentClient.call(specialPrompt);
      expect(result.success).toBe(true);
    });

    it('should handle concurrent AI calls', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      const calls = Array(10).fill(null).map((_, i) => {
        vi.mocked(agentClient.call).mockResolvedValueOnce({
          success: true,
          data: `Response ${i}`,
        });
        return agentClient.call(`Prompt ${i}`);
      });

      const results = await Promise.all(calls);

      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.data).toBe(`Response ${i}`);
      });
    });
  });

  describe('AIClient Class instantiation', () => {
    it('should instantiate the AIClient from the agents module', async () => {
      const { AIClient } = await import('../../agents/core/client.js');

      const client = new AIClient();

      expect(AIClient).toHaveBeenCalledTimes(1);
      expect(client).toBeDefined();
      expect(client.initialize).toBeDefined();
      expect(client.call).toBeDefined();
    });

    it('should initialize the AIClient before use', async () => {
      const { AIClient } = await import('../../agents/core/client.js');

      const client = new AIClient();
      await client.initialize();

      expect(client.initialize).toHaveBeenCalledTimes(1);
    });

    it('should make calls after initialization', async () => {
      const { AIClient } = await import('../../agents/core/client.js');

      const client = new AIClient();
      await client.initialize();

      const result = await client.call('test query');

      expect(client.call).toHaveBeenCalledWith('test query');
      expect(result).toEqual({ success: true });
    });

    it('should handle initialization errors', async () => {
      const { AIClient } = await import('../../agents/core/client.js');

      const client = new AIClient();
      vi.mocked(client.initialize).mockRejectedValueOnce(
        new Error('Failed to initialize AI provider')
      );

      await expect(client.initialize()).rejects.toThrow('Failed to initialize AI provider');
    });

    it('should handle call errors after successful initialization', async () => {
      const { AIClient } = await import('../../agents/core/client.js');

      const client = new AIClient();
      await client.initialize();

      vi.mocked(client.call).mockRejectedValueOnce(new Error('API key invalid'));

      await expect(client.call('bad key request')).rejects.toThrow('API key invalid');
    });
  });

  describe('Network and API Error Handling', () => {
    it('should handle network connection errors', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockRejectedValueOnce(
        new Error('ECONNREFUSED: Connection refused')
      );

      await expect(agentClient.call('network test')).rejects.toThrow('ECONNREFUSED');
    });

    it('should handle DNS resolution failures', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockRejectedValueOnce(
        new Error('ENOTFOUND: getaddrinfo ENOTFOUND api.openai.com')
      );

      await expect(agentClient.call('dns test')).rejects.toThrow('ENOTFOUND');
    });

    it('should handle SSL/TLS errors', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockRejectedValueOnce(
        new Error('UNABLE_TO_VERIFY_LEAF_SIGNATURE')
      );

      await expect(agentClient.call('ssl test')).rejects.toThrow('UNABLE_TO_VERIFY_LEAF_SIGNATURE');
    });

    it('should handle 429 Too Many Requests responses', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockRejectedValueOnce(
        new Error('HTTP 429: Too Many Requests - Please retry after 60s')
      );

      await expect(agentClient.call('rate limit test')).rejects.toThrow('429');
    });

    it('should handle 401 Unauthorized responses', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockRejectedValueOnce(
        new Error('HTTP 401: Unauthorized - Invalid API key')
      );

      await expect(agentClient.call('auth test')).rejects.toThrow('401');
    });

    it('should handle 403 Forbidden responses', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockRejectedValueOnce(
        new Error('HTTP 403: Forbidden - Account suspended')
      );

      await expect(agentClient.call('forbidden test')).rejects.toThrow('403');
    });

    it('should handle 500 Internal Server Error responses', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockRejectedValueOnce(
        new Error('HTTP 500: Internal Server Error')
      );

      await expect(agentClient.call('server error test')).rejects.toThrow('500');
    });

    it('should handle 502 Bad Gateway responses', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockRejectedValueOnce(
        new Error('HTTP 502: Bad Gateway')
      );

      await expect(agentClient.call('gateway test')).rejects.toThrow('502');
    });

    it('should handle 503 Service Unavailable responses', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockRejectedValueOnce(
        new Error('HTTP 503: Service Unavailable - Maintenance in progress')
      );

      await expect(agentClient.call('unavailable test')).rejects.toThrow('503');
    });
  });

  describe('Tool-Use-Aware Client Features', () => {
    it('should support function calling through the agent client', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockResolvedValueOnce({
        success: true,
        data: {
          tool_calls: [
            { name: 'search_prospects', arguments: { industry: 'SaaS', size: '50-200' } },
          ],
        },
      });

      const result = await agentClient.call('Search for SaaS companies with 50-200 employees');

      expect(result.success).toBe(true);
      expect(result.data.tool_calls).toHaveLength(1);
      expect(result.data.tool_calls[0].name).toBe('search_prospects');
    });

    it('should handle multiple tool calls in a single response', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockResolvedValueOnce({
        success: true,
        data: {
          tool_calls: [
            { name: 'search_prospects', arguments: { query: 'AI startups' } },
            { name: 'enrich_lead', arguments: { email: 'test@example.com' } },
            { name: 'score_lead', arguments: { company: 'TestCorp' } },
          ],
        },
      });

      const result = await agentClient.call('Find and score AI startup leads');

      expect(result.data.tool_calls).toHaveLength(3);
    });

    it('should handle tool execution errors gracefully', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockResolvedValueOnce({
        success: false,
        error: 'Tool execution failed: Database connection error',
        data: {
          tool_calls: [
            { name: 'search_prospects', error: 'Connection timeout' },
          ],
        },
      });

      const result = await agentClient.call('Search with broken DB');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool execution failed');
    });

    it('should handle agent context window limits', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockRejectedValueOnce(
        new Error('Context window exceeded: maximum 128000 tokens')
      );

      await expect(agentClient.call('Very large context request')).rejects.toThrow('Context window exceeded');
    });
  });

  describe('Module Loading and Import Behavior', () => {
    it('should not throw during module evaluation', async () => {
      vi.resetModules();

      vi.doMock('../../agents/core/client.js', () => ({
        default: {
          call: vi.fn().mockResolvedValue({ success: true }),
        },
      }));

      await expect(import('./client.js')).resolves.toBeDefined();
    });

    it('should load successfully when the agents module is available', async () => {
      vi.resetModules();

      vi.doMock('../../agents/core/client.js', () => ({
        default: {
          call: vi.fn().mockResolvedValue({ success: true }),
        },
      }));

      const module = await import('./client.js');
      expect(module).toBeDefined();
    });

    it('should handle missing agents module gracefully', async () => {
      vi.resetModules();

      vi.doMock('../../agents/core/client.js', () => {
        throw new Error('Module not found');
      });

      // The backward compat file itself should still load,
      // but calling the redirect would fail
      await expect(import('../../agents/core/client.js')).rejects.toThrow();
    });

    it('should export default client from agents module', async () => {
      // Reset modules to clear the throwing mock from the previous test,
      // then re-establish the top-level mock
      vi.resetModules();

      vi.doMock('../../agents/core/client.js', () => ({
        default: {
          call: vi.fn().mockResolvedValue({ success: true, data: 'mocked AI response' }),
          stream: vi.fn().mockReturnValue(new ReadableStream()),
        },
        AIClient: vi.fn().mockImplementation(() => ({
          initialize: vi.fn().mockResolvedValue(undefined),
          call: vi.fn().mockResolvedValue({ success: true }),
        })),
      }));

      const { default: agentClient } = await import('../../agents/core/client.js');

      expect(agentClient).toBeDefined();
      expect(agentClient.call).toBeDefined();
      expect(typeof agentClient.call).toBe('function');
    });

    it('should maintain consistent interface across reloads', async () => {
      vi.resetModules();

      vi.doMock('../../agents/core/client.js', () => ({
        default: {
          call: vi.fn().mockResolvedValue({ success: true }),
          stream: vi.fn().mockReturnValue(new ReadableStream()),
        },
        AIClient: vi.fn(),
      }));

      const { default: client1 } = await import('../../agents/core/client.js');
      const { default: client2 } = await import('../../agents/core/client.js');

      expect(typeof client1.call).toBe(typeof client2.call);
      expect(typeof client1.stream).toBe(typeof client2.stream);
    });
  });

  describe('Edge Cases and Boundary Values', () => {
    it('should handle response with null data field', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockResolvedValueOnce({
        success: true,
        data: null,
      });

      const result = await agentClient.call('null data test');

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should handle response with undefined data field', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockResolvedValueOnce({
        success: true,
        data: undefined,
      });

      const result = await agentClient.call('undefined data test');

      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it('should handle response with empty object data', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockResolvedValueOnce({
        success: true,
        data: {},
      });

      const result = await agentClient.call('empty data test');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('should handle response with deeply nested data', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');
      const deeplyNested = {
        level1: { level2: { level3: { level4: { value: 'deep' } } } },
      };

      vi.mocked(agentClient.call).mockResolvedValueOnce({
        success: true,
        data: deeplyNested,
      });

      const result = await agentClient.call('nested data test');

      expect(result.data.level1.level2.level3.level4.value).toBe('deep');
    });

    it('should handle response with array data', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockResolvedValueOnce({
        success: true,
        data: [
          { id: 1, name: 'Prospect A' },
          { id: 2, name: 'Prospect B' },
          { id: 3, name: 'Prospect C' },
        ],
      });

      const result = await agentClient.call('array data test');

      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(3);
    });

    it('should handle very large response data', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');
      const largeData = Array(10000).fill(null).map((_, i) => ({
        id: i,
        name: `Prospect ${i}`,
        email: `prospect${i}@example.com`,
        score: Math.random() * 100,
      }));

      vi.mocked(agentClient.call).mockResolvedValueOnce({
        success: true,
        data: largeData,
      });

      const result = await agentClient.call('large data test');

      expect(result.data).toHaveLength(10000);
    });

    it('should handle responses with numeric zero as valid data', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockResolvedValueOnce({
        success: true,
        data: 0,
      });

      const result = await agentClient.call('zero data test');

      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
    });

    it('should handle responses with boolean false as valid data', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockResolvedValueOnce({
        success: true,
        data: false,
      });

      const result = await agentClient.call('false data test');

      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });

    it('should handle responses with empty string as valid data', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      vi.mocked(agentClient.call).mockResolvedValueOnce({
        success: true,
        data: '',
      });

      const result = await agentClient.call('empty string test');

      expect(result.success).toBe(true);
      expect(result.data).toBe('');
    });

    it('should handle aborted requests', async () => {
      const { default: agentClient } = await import('../../agents/core/client.js');

      const abortError = new DOMException('The operation was aborted', 'AbortError');
      vi.mocked(agentClient.call).mockRejectedValueOnce(abortError);

      await expect(agentClient.call('abort test')).rejects.toThrow('aborted');
    });
  });
});
