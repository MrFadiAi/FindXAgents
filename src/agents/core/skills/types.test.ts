import { describe, it, expect, vi } from 'vitest';
import type {
  AgentSkill,
  SkillValidationContext,
  SkillIssue,
} from './types';

describe('AgentSkill', () => {
  describe('interface shape — validate', () => {
    it('should accept a skill with a validate function returning an empty array (pass)', async () => {
      const skill: AgentSkill = {
        name: 'test-skill',
        description: 'A test skill',
        validate: vi.fn().mockResolvedValue([]),
        getPromptAddition: () => '',
      };

      const context: SkillValidationContext = {
        agentName: 'agent-1',
        messages: [],
      };

      const result = await skill.validate(context);
      expect(result).toEqual([]);
      expect(skill.validate).toHaveBeenCalledWith(context);
    });

    it('should accept a validate function returning multiple issues', async () => {
      const issues: SkillIssue[] = [
        { severity: 'error', message: 'Tool output is invalid' },
        { severity: 'warning', message: 'Suboptimal pattern detected', suggestion: 'Consider using a different approach' },
        { severity: 'info', message: ' FYI note' },
      ];

      const skill: AgentSkill = {
        name: 'multi-issue-skill',
        description: 'Returns multiple issues',
        validate: vi.fn().mockResolvedValue(issues),
        getPromptAddition: () => '',
      };

      const result = await skill.validate({ agentName: 'agent', messages: [] });
      expect(result).toHaveLength(3);
      expect(result[0].severity).toBe('error');
      expect(result[1].suggestion).toBe('Consider using a different approach');
    });

    it('should support validate returning issues with suggestion field present or absent', async () => {
      const issues: SkillIssue[] = [
        { severity: 'warning', message: 'No suggestion here' },
        { severity: 'error', message: 'Has suggestion', suggestion: 'Fix it' },
      ];

      const skill: AgentSkill = {
        name: 'suggestion-skill',
        description: 'Tests optional suggestion',
        validate: vi.fn().mockResolvedValue(issues),
        getPromptAddition: () => '',
      };

      const result = await skill.validate({ agentName: 'a', messages: [] });
      expect(result[0].suggestion).toBeUndefined();
      expect(result[1].suggestion).toBe('Fix it');
    });
  });

  describe('interface shape — getPromptAddition', () => {
    it('should return a string from getPromptAddition', () => {
      const skill: AgentSkill = {
        name: 'prompt-skill',
        description: 'Adds prompt',
        validate: vi.fn().mockResolvedValue([]),
        getPromptAddition: () => 'Always respond in JSON format.',
      };

      expect(skill.getPromptAddition()).toBe('Always respond in JSON format.');
    });

    it('should return empty string when no prompt addition is needed', () => {
      const skill: AgentSkill = {
        name: 'no-prompt-skill',
        description: 'No prompt addition',
        validate: vi.fn().mockResolvedValue([]),
        getPromptAddition: () => '',
      };

      expect(skill.getPromptAddition()).toBe('');
    });

    it('should support dynamic prompt additions based on state', () => {
      let counter = 0;
      const skill: AgentSkill = {
        name: 'dynamic-prompt-skill',
        description: 'Dynamic prompt',
        validate: vi.fn().mockResolvedValue([]),
        getPromptAddition: () => `Attempt ${++counter}`,
      };

      expect(skill.getPromptAddition()).toBe('Attempt 1');
      expect(skill.getPromptAddition()).toBe('Attempt 2');
      expect(skill.getPromptAddition()).toBe('Attempt 3');
    });
  });

  describe('interface shape — name and description', () => {
    it('should store name and description as strings', () => {
      const skill: AgentSkill = {
        name: 'my-skill',
        description: 'Validates output format',
        validate: vi.fn().mockResolvedValue([]),
        getPromptAddition: () => '',
      };

      expect(skill.name).toBe('my-skill');
      expect(skill.description).toBe('Validates output format');
    });

    it('should allow empty name and description', () => {
      const skill: AgentSkill = {
        name: '',
        description: '',
        validate: vi.fn().mockResolvedValue([]),
        getPromptAddition: () => '',
      };

      expect(skill.name).toBe('');
      expect(skill.description).toBe('');
    });
  });
});

describe('SkillValidationContext', () => {
  describe('minimal context (required fields only)', () => {
    it('should accept context with only agentName and messages', () => {
      const context: SkillValidationContext = {
        agentName: 'research-agent',
        messages: [],
      };

      expect(context.agentName).toBe('research-agent');
      expect(context.messages).toEqual([]);
      expect(context.toolCall).toBeUndefined();
      expect(context.finalOutput).toBeUndefined();
    });

    it('should accept context with messages containing various roles', () => {
      const context: SkillValidationContext = {
        agentName: 'agent',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Find leads for me.' },
          { role: 'assistant', content: 'I found 5 leads.' },
          { role: 'tool', content: { result: [1, 2, 3] } },
        ],
      };

      expect(context.messages).toHaveLength(4);
      expect(context.messages[0].role).toBe('system');
      expect(context.messages[3].content).toEqual({ result: [1, 2, 3] });
    });
  });

  describe('context with toolCall', () => {
    it('should accept context with toolCall containing name, input, and output', () => {
      const context: SkillValidationContext = {
        agentName: 'search-agent',
        toolCall: {
          name: 'web_search',
          input: { query: 'AI startups', limit: 10 },
          output: { results: ['Company A', 'Company B'] },
        },
        messages: [],
      };

      expect(context.toolCall).toBeDefined();
      expect(context.toolCall!.name).toBe('web_search');
      expect(context.toolCall!.input).toEqual({ query: 'AI startups', limit: 10 });
      expect(context.toolCall!.output).toEqual({ results: ['Company A', 'Company B'] });
    });

    it('should accept toolCall with complex nested input', () => {
      const context: SkillValidationContext = {
        agentName: 'agent',
        toolCall: {
          name: 'create_campaign',
          input: {
            config: {
              targeting: { locations: ['US', 'UK'], industries: ['SaaS'] },
              budget: { min: 1000, max: 5000 },
            },
            metadata: null,
          },
          output: { id: 'camp-123', status: 'created' },
        },
        messages: [],
      };

      expect(context.toolCall!.input.config.targeting.locations).toEqual(['US', 'UK']);
      expect(context.toolCall!.input.metadata).toBeNull();
    });

    it('should accept toolCall with various output types', () => {
      const stringOutput: SkillValidationContext = {
        agentName: 'agent',
        toolCall: { name: 'tool', input: {}, output: 'plain string result' },
        messages: [],
      };
      expect(stringOutput.toolCall!.output).toBe('plain string result');

      const nullOutput: SkillValidationContext = {
        agentName: 'agent',
        toolCall: { name: 'tool', input: {}, output: null },
        messages: [],
      };
      expect(nullOutput.toolCall!.output).toBeNull();

      const arrayOutput: SkillValidationContext = {
        agentName: 'agent',
        toolCall: { name: 'tool', input: {}, output: [1, 2, 3] },
        messages: [],
      };
      expect(arrayOutput.toolCall!.output).toEqual([1, 2, 3]);

      const booleanOutput: SkillValidationContext = {
        agentName: 'agent',
        toolCall: { name: 'tool', input: {}, output: true },
        messages: [],
      };
      expect(booleanOutput.toolCall!.output).toBe(true);
    });

    it('should accept toolCall with empty input', () => {
      const context: SkillValidationContext = {
        agentName: 'agent',
        toolCall: { name: 'ping', input: {}, output: 'pong' },
        messages: [],
      };

      expect(context.toolCall!.input).toEqual({});
    });
  });

  describe('context with finalOutput', () => {
    it('should accept context with finalOutput at agent completion', () => {
      const context: SkillValidationContext = {
        agentName: 'summary-agent',
        messages: [],
        finalOutput: 'Here is the summary of all findings...',
      };

      expect(context.finalOutput).toBe('Here is the summary of all findings...');
    });

    it('should accept finalOutput as an empty string', () => {
      const context: SkillValidationContext = {
        agentName: 'agent',
        messages: [],
        finalOutput: '',
      };

      expect(context.finalOutput).toBe('');
    });

    it('should accept finalOutput as a long multi-line string', () => {
      const longOutput = `Line 1
Line 2
Line 3
---
## Summary
- Item A
- Item B`;

      const context: SkillValidationContext = {
        agentName: 'agent',
        messages: [],
        finalOutput: longOutput,
      };

      expect(context.finalOutput).toContain('## Summary');
    });
  });

  describe('context with all fields populated', () => {
    it('should accept a fully populated context', () => {
      const context: SkillValidationContext = {
        agentName: 'full-agent',
        toolCall: {
          name: 'enrich_lead',
          input: { leadId: 'lead-456' },
          output: { email: 'test@example.com', company: 'Acme' },
        },
        messages: [
          { role: 'user', content: 'Enrich this lead' },
          { role: 'assistant', content: 'Calling enrich_lead' },
        ],
        finalOutput: 'Lead has been enriched with email and company data.',
      };

      expect(context.agentName).toBe('full-agent');
      expect(context.toolCall!.name).toBe('enrich_lead');
      expect(context.messages).toHaveLength(2);
      expect(context.finalOutput).toBe('Lead has been enriched with email and company data.');
    });
  });

  describe('edge cases', () => {
    it('should allow messages with unknown content types', () => {
      const context: SkillValidationContext = {
        agentName: 'agent',
        messages: [
          { role: 'user', content: 42 },
          { role: 'assistant', content: null },
          { role: 'assistant', content: { type: 'array', data: [1, 2] } },
          { role: 'system', content: true },
        ],
      };

      expect(context.messages[0].content).toBe(42);
      expect(context.messages[1].content).toBeNull();
      expect(context.messages[2].content).toEqual({ type: 'array', data: [1, 2] });
      expect(context.messages[3].content).toBe(true);
    });

    it('should allow messages with empty string content', () => {
      const context: SkillValidationContext = {
        agentName: 'agent',
        messages: [{ role: 'assistant', content: '' }],
      };

      expect(context.messages[0].content).toBe('');
    });
  });
});

describe('SkillIssue', () => {
  describe('severity levels', () => {
    it('should create an error issue', () => {
      const issue: SkillIssue = {
        severity: 'error',
        message: 'Output is malformed JSON',
      };

      expect(issue.severity).toBe('error');
      expect(issue.message).toBe('Output is malformed JSON');
      expect(issue.suggestion).toBeUndefined();
    });

    it('should create a warning issue', () => {
      const issue: SkillIssue = {
        severity: 'warning',
        message: 'Response is verbose',
        suggestion: 'Be more concise',
      };

      expect(issue.severity).toBe('warning');
      expect(issue.suggestion).toBe('Be more concise');
    });

    it('should create an info issue', () => {
      const issue: SkillIssue = {
        severity: 'info',
        message: 'Tool call used deprecated parameter',
        suggestion: 'Consider migrating to the new API',
      };

      expect(issue.severity).toBe('info');
    });

    it('should only allow valid severity values', () => {
      const severities: Array<SkillIssue['severity']> = ['error', 'warning', 'info'];
      expect(severities).toHaveLength(3);
      expect(severities).toContain('error');
      expect(severities).toContain('warning');
      expect(severities).toContain('info');
    });
  });

  describe('optional suggestion', () => {
    it('should work without a suggestion', () => {
      const issue: SkillIssue = {
        severity: 'error',
        message: 'Something went wrong',
      };

      expect(issue).not.toHaveProperty('suggestion');
      expect(issue.suggestion).toBeUndefined();
    });

    it('should work with a suggestion', () => {
      const issue: SkillIssue = {
        severity: 'warning',
        message: 'Slow query detected',
        suggestion: 'Add an index to the email column',
      };

      expect(issue.suggestion).toBe('Add an index to the email column');
    });

    it('should allow empty string suggestion', () => {
      const issue: SkillIssue = {
        severity: 'info',
        message: 'Note',
        suggestion: '',
      };

      expect(issue.suggestion).toBe('');
    });
  });
});

describe('AgentSkill implementation integration', () => {
  describe('concrete skill — output format validator', () => {
    it('should validate JSON output successfully', async () => {
      const jsonValidator: AgentSkill = {
        name: 'json-validator',
        description: 'Validates that tool output is valid JSON',
        validate: async (context) => {
          const issues: SkillIssue[] = [];
          if (context.toolCall) {
            try {
              const output = context.toolCall.output;
              if (typeof output === 'string') {
                JSON.parse(output);
              }
            } catch {
              issues.push({
                severity: 'error',
                message: 'Tool output is not valid JSON',
                suggestion: 'Ensure the tool returns properly formatted JSON',
              });
            }
          }
          return issues;
        },
        getPromptAddition: () => 'Always respond with valid JSON.',
      };

      const validContext: SkillValidationContext = {
        agentName: 'test-agent',
        toolCall: { name: 'fetch', input: {}, output: '{"key": "value"}' },
        messages: [],
      };

      const result = await jsonValidator.validate(validContext);
      expect(result).toEqual([]);
    });

    it('should detect invalid JSON output', async () => {
      const jsonValidator: AgentSkill = {
        name: 'json-validator',
        description: 'Validates that tool output is valid JSON',
        validate: async (context) => {
          const issues: SkillIssue[] = [];
          if (context.toolCall) {
            try {
              const output = context.toolCall.output;
              if (typeof output === 'string') {
                JSON.parse(output);
              }
            } catch {
              issues.push({
                severity: 'error',
                message: 'Tool output is not valid JSON',
                suggestion: 'Ensure the tool returns properly formatted JSON',
              });
            }
          }
          return issues;
        },
        getPromptAddition: () => 'Always respond with valid JSON.',
      };

      const invalidContext: SkillValidationContext = {
        agentName: 'test-agent',
        toolCall: { name: 'fetch', input: {}, output: '{not valid json}' },
        messages: [],
      };

      const result = await jsonValidator.validate(invalidContext);
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('error');
      expect(result[0].message).toContain('not valid JSON');
    });
  });

  describe('concrete skill — PII detector', () => {
    it('should detect email addresses in final output', async () => {
      const piiDetector: AgentSkill = {
        name: 'pii-detector',
        description: 'Detects PII in agent output',
        validate: async (context) => {
          const issues: SkillIssue[] = [];
          const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          if (context.finalOutput && emailPattern.test(context.finalOutput)) {
            issues.push({
              severity: 'warning',
              message: 'PII detected: email address found in output',
              suggestion: 'Mask email addresses before returning output',
            });
          }
          return issues;
        },
        getPromptAddition: () => 'Never include personal email addresses in your output.',
      };

      const contextWithPii: SkillValidationContext = {
        agentName: 'lead-agent',
        messages: [],
        finalOutput: 'Contact john.doe@example.com for more info.',
      };

      const result = await piiDetector.validate(contextWithPii);
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('warning');
    });

    it('should pass when no PII is present', async () => {
      const piiDetector: AgentSkill = {
        name: 'pii-detector',
        description: 'Detects PII in agent output',
        validate: async (context) => {
          const issues: SkillIssue[] = [];
          const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          if (context.finalOutput && emailPattern.test(context.finalOutput)) {
            issues.push({
              severity: 'warning',
              message: 'PII detected: email address found in output',
              suggestion: 'Mask email addresses before returning output',
            });
          }
          return issues;
        },
        getPromptAddition: () => 'Never include personal email addresses in your output.',
      };

      const cleanContext: SkillValidationContext = {
        agentName: 'lead-agent',
        messages: [],
        finalOutput: 'No personal data here.',
      };

      const result = await piiDetector.validate(cleanContext);
      expect(result).toEqual([]);
    });

    it('should pass when finalOutput is undefined', async () => {
      const piiDetector: AgentSkill = {
        name: 'pii-detector',
        description: 'Detects PII in agent output',
        validate: async (context) => {
          const issues: SkillIssue[] = [];
          const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          if (context.finalOutput && emailPattern.test(context.finalOutput)) {
            issues.push({
              severity: 'warning',
              message: 'PII detected: email address found in output',
              suggestion: 'Mask email addresses before returning output',
            });
          }
          return issues;
        },
        getPromptAddition: () => 'Never include personal email addresses in your output.',
      };

      const noOutput: SkillValidationContext = {
        agentName: 'lead-agent',
        messages: [],
      };

      const result = await piiDetector.validate(noOutput);
      expect(result).toEqual([]);
    });
  });

  describe('concrete skill — tool call counter', () => {
    it('should warn when too many tool calls are made', async () => {
      const maxToolCalls: AgentSkill = {
        name: 'max-tool-calls',
        description: 'Warns if agent makes too many tool calls',
        validate: async (context) => {
          const issues: SkillIssue[] = [];
          const toolCallCount = context.messages.filter(
            (m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.includes('tool_call')
          ).length;

          if (toolCallCount > 5) {
            issues.push({
              severity: 'warning',
              message: `Agent made ${toolCallCount} tool calls, which exceeds the recommended maximum of 5`,
              suggestion: 'Try to consolidate tool calls or use batch operations',
            });
          }
          return issues;
        },
        getPromptAddition: () => 'Try to accomplish your task with as few tool calls as possible.',
      };

      const context: SkillValidationContext = {
        agentName: 'agent',
        messages: Array(7).fill({ role: 'assistant', content: 'tool_call: fetch_data' }),
      };

      const result = await maxToolCalls.validate(context);
      expect(result).toHaveLength(1);
      expect(result[0].message).toContain('7 tool calls');
    });

    it('should pass when tool calls are within limit', async () => {
      const maxToolCalls: AgentSkill = {
        name: 'max-tool-calls',
        description: 'Warns if agent makes too many tool calls',
        validate: async (context) => {
          const issues: SkillIssue[] = [];
          const toolCallCount = context.messages.filter(
            (m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.includes('tool_call')
          ).length;

          if (toolCallCount > 5) {
            issues.push({
              severity: 'warning',
              message: `Agent made ${toolCallCount} tool calls, which exceeds the recommended maximum of 5`,
              suggestion: 'Try to consolidate tool calls or use batch operations',
            });
          }
          return issues;
        },
        getPromptAddition: () => 'Try to accomplish your task with as few tool calls as possible.',
      };

      const context: SkillValidationContext = {
        agentName: 'agent',
        messages: Array(3).fill({ role: 'assistant', content: 'tool_call: fetch_data' }),
      };

      const result = await maxToolCalls.validate(context);
      expect(result).toEqual([]);
    });
  });

  describe('concrete skill — message role validator', () => {
    it('should error when no system message is present', async () => {
      const roleValidator: AgentSkill = {
        name: 'role-validator',
        description: 'Ensures conversation starts with a system message',
        validate: async (context) => {
          const issues: SkillIssue[] = [];
          if (context.messages.length === 0) {
            return issues;
          }
          if (context.messages[0].role !== 'system') {
            issues.push({
              severity: 'error',
              message: 'Conversation does not start with a system message',
              suggestion: 'Always include a system message as the first message',
            });
          }
          return issues;
        },
        getPromptAddition: () => '',
      };

      const noSystemContext: SkillValidationContext = {
        agentName: 'agent',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const result = await roleValidator.validate(noSystemContext);
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('error');
    });

    it('should pass when conversation starts with system message', async () => {
      const roleValidator: AgentSkill = {
        name: 'role-validator',
        description: 'Ensures conversation starts with a system message',
        validate: async (context) => {
          const issues: SkillIssue[] = [];
          if (context.messages.length === 0) {
            return issues;
          }
          if (context.messages[0].role !== 'system') {
            issues.push({
              severity: 'error',
              message: 'Conversation does not start with a system message',
              suggestion: 'Always include a system message as the first message',
            });
          }
          return issues;
        },
        getPromptAddition: () => '',
      };

      const goodContext: SkillValidationContext = {
        agentName: 'agent',
        messages: [
          { role: 'system', content: 'You are a prospecting assistant.' },
          { role: 'user', content: 'Find leads' },
        ],
      };

      const result = await roleValidator.validate(goodContext);
      expect(result).toEqual([]);
    });

    it('should pass when messages array is empty', async () => {
      const roleValidator: AgentSkill = {
        name: 'role-validator',
        description: 'Ensures conversation starts with a system message',
        validate: async (context) => {
          const issues: SkillIssue[] = [];
          if (context.messages.length === 0) {
            return issues;
          }
          if (context.messages[0].role !== 'system') {
            issues.push({
              severity: 'error',
              message: 'Conversation does not start with a system message',
              suggestion: 'Always include a system message as the first message',
            });
          }
          return issues;
        },
        getPromptAddition: () => '',
      };

      const emptyContext: SkillValidationContext = {
        agentName: 'agent',
        messages: [],
      };

      const result = await roleValidator.validate(emptyContext);
      expect(result).toEqual([]);
    });
  });

  describe('concrete skill — async validation with external checks', () => {
    it('should handle async validation that queries external APIs', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ valid: true }),
      });

      const apiValidator: AgentSkill = {
        name: 'api-validator',
        description: 'Validates output against external API',
        validate: async (context) => {
          const issues: SkillIssue[] = [];
          if (context.toolCall?.output) {
            const response = await mockFetch('https://api.example.com/validate', {
              method: 'POST',
              body: JSON.stringify(context.toolCall.output),
            });
            const result = await response.json();
            if (!result.valid) {
              issues.push({
                severity: 'error',
                message: 'External validation failed',
              });
            }
          }
          return issues;
        },
        getPromptAddition: () => '',
      };

      const context: SkillValidationContext = {
        agentName: 'agent',
        toolCall: { name: 'tool', input: {}, output: { data: 'test' } },
        messages: [],
      };

      const result = await apiValidator.validate(context);
      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should handle external API returning invalid result', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ valid: false }),
      });

      const apiValidator: AgentSkill = {
        name: 'api-validator',
        description: 'Validates output against external API',
        validate: async (context) => {
          const issues: SkillIssue[] = [];
          if (context.toolCall?.output) {
            const response = await mockFetch('https://api.example.com/validate', {
              method: 'POST',
              body: JSON.stringify(context.toolCall.output),
            });
            const result = await response.json();
            if (!result.valid) {
              issues.push({
                severity: 'error',
                message: 'External validation failed',
              });
            }
          }
          return issues;
        },
        getPromptAddition: () => '',
      };

      const context: SkillValidationContext = {
        agentName: 'agent',
        toolCall: { name: 'tool', input: {}, output: { bad: 'data' } },
        messages: [],
      };

      const result = await apiValidator.validate(context);
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('error');
    });

    it('should handle external API failure gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const apiValidator: AgentSkill = {
        name: 'api-validator',
        description: 'Validates output against external API',
        validate: async (context) => {
          const issues: SkillIssue[] = [];
          try {
            if (context.toolCall?.output) {
              await mockFetch('https://api.example.com/validate');
            }
          } catch {
            issues.push({
              severity: 'warning',
              message: 'Could not validate output externally: Network error',
              suggestion: 'Retry or fall back to local validation',
            });
          }
          return issues;
        },
        getPromptAddition: () => '',
      };

      const context: SkillValidationContext = {
        agentName: 'agent',
        toolCall: { name: 'tool', input: {}, output: 'test' },
        messages: [],
      };

      const result = await apiValidator.validate(context);
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('warning');
      expect(result[0].message).toContain('Network error');
    });
  });

  describe('multiple skills composed together', () => {
    it('should run multiple skills and collect all issues', async () => {
      const skill1: AgentSkill = {
        name: 'skill-1',
        description: 'First skill',
        validate: async () => [{ severity: 'warning' as const, message: 'Warning from skill 1' }],
        getPromptAddition: () => 'Rule 1',
      };

      const skill2: AgentSkill = {
        name: 'skill-2',
        description: 'Second skill',
        validate: async () => [{ severity: 'error' as const, message: 'Error from skill 2' }],
        getPromptAddition: () => 'Rule 2',
      };

      const skill3: AgentSkill = {
        name: 'skill-3',
        description: 'Passing skill',
        validate: async () => [],
        getPromptAddition: () => 'Rule 3',
      };

      const skills = [skill1, skill2, skill3];
      const context: SkillValidationContext = {
        agentName: 'agent',
        messages: [],
      };

      const allIssues = await Promise.all(skills.map((s) => s.validate(context)));

      expect(allIssues[0]).toHaveLength(1);
      expect(allIssues[0][0].severity).toBe('warning');
      expect(allIssues[1]).toHaveLength(1);
      expect(allIssues[1][0].severity).toBe('error');
      expect(allIssues[2]).toHaveLength(0);

      const promptAdditions = skills.map((s) => s.getPromptAddition()).join('\n');
      expect(promptAdditions).toBe('Rule 1\nRule 2\nRule 3');
    });

    it('should handle a mix of passing and failing skills with proper severity ordering', async () => {
      const skills: AgentSkill[] = [
        {
          name: 'info-skill',
          description: '',
          validate: async () => [{ severity: 'info', message: 'FYI' }],
          getPromptAddition: () => '',
        },
        {
          name: 'pass-skill',
          description: '',
          validate: async () => [],
          getPromptAddition: () => '',
        },
        {
          name: 'error-skill',
          description: '',
          validate: async () => [
            { severity: 'error', message: 'Critical failure' },
            { severity: 'warning', message: 'Minor issue' },
          ],
          getPromptAddition: () => '',
        },
      ];

      const context: SkillValidationContext = {
        agentName: 'composed-agent',
        toolCall: { name: 'action', input: {}, output: 'result' },
        messages: [{ role: 'system', content: 'Go' }],
        finalOutput: 'Done',
      };

      const results = await Promise.all(skills.map((s) => s.validate(context)));
      const allIssues = results.flat();

      expect(allIssues).toHaveLength(3);

      const errors = allIssues.filter((i) => i.severity === 'error');
      const warnings = allIssues.filter((i) => i.severity === 'warning');
      const infos = allIssues.filter((i) => i.severity === 'info');

      expect(errors).toHaveLength(1);
      expect(warnings).toHaveLength(1);
      expect(infos).toHaveLength(1);
    });
  });
});