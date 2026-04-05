import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  ToolDefinition,
  Tool,
  AgentConfig,
  AgentRunResult,
  ToolCallLog,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ContentBlock,
  MessageParam,
  AnthropicResponse
} from './types';

describe('Core Agent Types', () => {

  describe('ToolDefinition', () => {
    it('should accept a valid minimal ToolDefinition', () => {
      const toolDef: ToolDefinition = {
        name: 'get_weather',
        description: 'Fetches the current weather',
        input_schema: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name' }
          }
        }
      };

      expect(toolDef.name).toBe('get_weather');
      expect(toolDef.input_schema.type).toBe('object');
      expect(toolDef.input_schema.required).toBeUndefined();
    });

    it('should accept a ToolDefinition with required fields', () => {
      const toolDef: ToolDefinition = {
        name: 'create_event',
        description: 'Creates a calendar event',
        input_schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            date: { type: 'string' }
          },
          required: ['title', 'date']
        }
      };

      expect(toolDef.input_schema.required).toEqual(['title', 'date']);
      expect(Array.isArray(toolDef.input_schema.required)).toBe(true);
    });

    it('should allow arbitrary JSON Schema properties', () => {
      const toolDef: ToolDefinition = {
        name: 'complex_tool',
        description: 'A complex tool',
        input_schema: {
          type: 'object',
          properties: {
            nested: {
              type: 'object',
              additionalProperties: false,
              properties: {
                enumVal: { type: 'string', enum: ['A', 'B'] }
              }
            }
          },
          required: []
        }
      };

      expect(toolDef.input_schema.properties.nested).toBeDefined();
    });
  });

  describe('Tool', () => {
    it('should extend ToolDefinition with an execute function', async () => {
      const tool: Tool = {
        name: 'mock_tool',
        description: 'A mock tool',
        input_schema: {
          type: 'object',
          properties: {}
        },
        execute: vi.fn().mockResolvedValue('Tool execution success')
      };

      const result = await tool.execute({ param: 'value' });
      expect(result).toBe('Tool execution success');
      expect(tool.execute).toHaveBeenCalledWith({ param: 'value' });
    });

    it('should handle rejection during execute', async () => {
      const tool: Tool = {
        name: 'failing_tool',
        description: 'Fails on execution',
        input_schema: {
          type: 'object',
          properties: {}
        },
        execute: vi.fn().mockRejectedValue(new Error('Execution failed'))
      };

      await expect(tool.execute({})).rejects.toThrow('Execution failed');
    });
  });

  describe('AgentConfig', () => {
    it('should accept a valid AgentConfig', () => {
      const config: AgentConfig = {
        name: 'ProspectingAgent',
        systemPrompt: 'You are a helpful prospecting assistant.',
        tools: [],
        maxIterations: 10,
        maxTokens: 2000
      };

      expect(config.name).toBe('ProspectingAgent');
      expect(config.tools).toHaveLength(0);
      expect(config.maxIterations).toBe(10);
    });

    it('should accept an AgentConfig with tools', () => {
      const mockTool: Tool = {
        name: 'tool1',
        description: 'desc',
        input_schema: { type: 'object', properties: {} },
        execute: vi.fn()
      };

      const config: AgentConfig = {
        name: 'AgentWithTools',
        systemPrompt: 'Use tools wisely',
        tools: [mockTool],
        maxIterations: 5,
        maxTokens: 1000
      };

      expect(config.tools).toContain(mockTool);
      expect(typeof config.tools[0].execute).toBe('function');
    });
  });

  describe('AgentRunResult', () => {
    it('should represent a successful agent run result', () => {
      const result: AgentRunResult = {
        output: 'Here is the prospect lead list.',
        toolCalls: [],
        totalInputTokens: 150,
        totalOutputTokens: 50
      };

      expect(result.output).toBeTypeOf('string');
      expect(result.toolCalls).toHaveLength(0);
      expect(result.totalInputTokens).toBe(150);
    });

    it('should include multiple tool call logs', () => {
      const call1: ToolCallLog = {
        tool: 'fetch_linkedin',
        input: { url: 'https://linkedin.com/in/someuser' },
        output: 'Profile found',
        timestamp: new Date().toISOString()
      };
      const call2: ToolCallLog = {
        tool: 'write_email',
        input: { tone: 'formal' },
        output: 'Email drafted',
        timestamp: new Date().toISOString()
      };

      const result: AgentRunResult = {
        output: 'Emails drafted successfully.',
        toolCalls: [call1, call2],
        totalInputTokens: 500,
        totalOutputTokens: 200
      };

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].tool).toBe('fetch_linkedin');
    });
  });

  describe('ToolCallLog', () => {
    it('should hold accurate details of a single tool invocation', () => {
      const log: ToolCallLog = {
        tool: 'database_query',
        input: { query: 'SELECT * FROM users' },
        output: '10 users found',
        timestamp: '2023-10-01T12:00:00Z'
      };

      expect(log.tool).toBe('database_query');
      expect(log.input.query).toBe('SELECT * FROM users');
      expect(log.timestamp).toBe('2023-10-01T12:00:00Z');
    });
  });

  describe('ContentBlock Union Types', () => {
    it('should correctly shape a TextBlock', () => {
      const block: TextBlock = { type: 'text', text: 'Hello world' };
      expect(block.type).toBe('text');
      expect(block.text).toBeTypeOf('string');
    });

    it('should correctly shape a ToolUseBlock', () => {
      const block: ToolUseBlock = {
        type: 'tool_use',
        id: 'toolu_01',
        name: 'get_weather',
        input: { city: 'London' }
      };
      expect(block.type).toBe('tool_use');
      expect(block.id).toBeTypeOf('string');
      expect(block.input).toEqual({ city: 'London' });
    });

    it('should correctly shape a ToolResultBlock without error', () => {
      const block: ToolResultBlock = {
        type: 'tool_result',
        tool_use_id: 'toolu_01',
        content: 'Weather is sunny'
      };
      expect(block.type).toBe('tool_result');
      expect(block.is_error).toBeUndefined();
    });

    it('should correctly shape a ToolResultBlock with error', () => {
      const block: ToolResultBlock = {
        type: 'tool_result',
        tool_use_id: 'toolu_02',
        content: 'City not found',
        is_error: true
      };
      expect(block.is_error).toBe(true);
    });

    it('ContentBlock should accept any valid block type', () => {
      const blocks: ContentBlock[] = [
        { type: 'text', text: 'User requested weather' },
        { type: 'tool_use', id: '1', name: 'weather', input: {} },
        { type: 'tool_result', tool_use_id: '1', content: 'Sunny' }
      ];

      expect(blocks[0].type).toBe('text');
      expect(blocks[1].type).toBe('tool_use');
      expect(blocks[2].type).toBe('tool_result');
      
      if (blocks[2].type === 'tool_result') {
        expect(blocks[2].tool_use_id).toBe('1');
      }
    });
  });

  describe('MessageParam', () => {
    it('should accept a string-based user message', () => {
      const message: MessageParam = {
        role: 'user',
        content: 'Find me leads for AI startups.'
      };

      expect(message.role).toBe('user');
      expect(message.content).toBeTypeOf('string');
    });

    it('should accept an array of ContentBlocks for an assistant message', () => {
      const message: MessageParam = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will search for leads.' },
          { type: 'tool_use', id: 'tu_1', name: 'search', input: { query: 'AI startups' } }
        ]
      };

      expect(message.role).toBe('assistant');
      expect(Array.isArray(message.content)).toBe(true);
      
      if (Array.isArray(message.content)) {
        expect(message.content).toHaveLength(2);
      }
    });
  });

  describe('AnthropicResponse', () => {
    it('should represent a standard Anthropic API response', () => {
      const response: AnthropicResponse = {
        id: 'msg_012345',
        content: [
          { type: 'text', text: 'Hello! How can I help you today?' }
        ],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 25,
          output_tokens: 10
        }
      };

      expect(response.id).toBeTypeOf('string');
      expect(response.stop_reason).toBe('end_turn');
      expect(response.usage.input_tokens).toBe(25);
    });

    it('should represent a tool_use stopped response', () => {
      const response: AnthropicResponse = {
        id: 'msg_098765',
        content: [
          { type: 'tool_use', id: 'tu_55', name: 'calculator', input: { expr: '2+2' } }
        ],
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 30,
          output_tokens: 15
        }
      };

      expect(response.stop_reason).toBe('tool_use');
      
      if (response.content[0].type === 'tool_use') {
        expect(response.content[0].name).toBe('calculator');
      }
    });

    it('should handle max_tokens stop_reason', () => {
      const response: AnthropicResponse = {
        id: 'msg_max',
        content: [
          { type: 'text', text: 'This is a very long response that got cut off because...' }
        ],
        stop_reason: 'max_tokens',
        usage: {
          input_tokens: 10,
          output_tokens: 100
        }
      };

      expect(response.stop_reason).toBe('max_tokens');
      expect(response.usage.output_tokens).toBeGreaterThan(0);
    });
  });

});