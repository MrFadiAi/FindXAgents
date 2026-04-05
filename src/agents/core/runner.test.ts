import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgentWithLogging } from './runner.js';
import { prisma } from '../../lib/db/client.js';
import { chat } from './client.js';
import type { AgentConfig, ToolCallLog, ContentBlock, ToolUseBlock, MessageParam } from './types.js';

vi.mock('../../lib/db/client.js', () => ({
  prisma: {
    agentLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('./client.js', () => ({
  chat: vi.fn(),
}));

describe('runAgentWithLogging', () => {
  const agentConfig: AgentConfig & { id: string } = {
    id: 'agent-1',
    name: 'TestAgent',
    systemPrompt: 'You are a helpful assistant.',
    maxTokens: 1000,
    maxIterations: 5,
    tools: [
      {
        name: 'calculator',
        execute: vi.fn().mockResolvedValue('42'),
      },
    ],
  };

  const context = {
    agentId: 'agent-1',
    pipelineRunId: 'run-1',
    phase: 'research',
  };

  const userMessage = 'Calculate 6 * 7';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(chat).mockReset();
    // Re-setup tool execute mock since resetAllMocks clears implementations
    (agentConfig.tools[0] as any).execute = vi.fn().mockResolvedValue('42');
  });

  afterEach(() => {
    // Verify no lingering mock state
    vi.mocked(chat).mockReset();
  });

  it('should return output when no tools are requested', async () => {
    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'The answer is 42' }],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    const result = await runAgentWithLogging(agentConfig, context, userMessage);

    expect(result.output).toBe('The answer is 42');
    expect(result.toolCalls).toEqual([]);
    expect(result.totalInputTokens).toBe(10);
    expect(result.totalOutputTokens).toBe(20);
    expect(prisma.agentLog.create).toHaveBeenCalledTimes(2);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('should handle a single tool call and return the final result', async () => {
    vi.mocked(chat).mockResolvedValueOnce({
      content: [
        { type: 'tool_use', id: 'tool-1', name: 'calculator', input: { expression: '6 * 7' } },
      ],
      usage: { input_tokens: 15, output_tokens: 25 },
    });

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'The result is 42' }],
      usage: { input_tokens: 30, output_tokens: 10 },
    });

    const result = await runAgentWithLogging(agentConfig, context, userMessage);

    expect(result.output).toBe('The result is 42');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].tool).toBe('calculator');
    expect(result.toolCalls[0].output).toBe('42');
    expect(result.totalInputTokens).toBe(45);
    expect(result.totalOutputTokens).toBe(35);
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it('should handle multiple tool calls in parallel', async () => {
    const tool1 = { execute: vi.fn().mockResolvedValue('Result 1') };
    const tool2 = { execute: vi.fn().mockResolvedValue('Result 2') };

    const multiToolConfig = {
      ...agentConfig,
      tools: [
        { name: 'tool1', ...tool1 },
        { name: 'tool2', ...tool2 },
      ],
    };

    vi.mocked(chat).mockResolvedValueOnce({
      content: [
        { type: 'tool_use', id: 'tu-1', name: 'tool1', input: {} },
        { type: 'tool_use', id: 'tu-2', name: 'tool2', input: {} },
      ],
      usage: { input_tokens: 10, output_tokens: 10 },
    });

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Done' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    const result = await runAgentWithLogging(multiToolConfig, context, userMessage);

    expect(result.output).toBe('Done');
    expect(result.toolCalls).toHaveLength(2);
    expect(tool1.execute).toHaveBeenCalledTimes(1);
    expect(tool2.execute).toHaveBeenCalledTimes(1);
  });

  it('should handle unknown tools gracefully', async () => {
    vi.mocked(chat).mockResolvedValueOnce({
      content: [
        { type: 'tool_use', id: 'tu-1', name: 'unknown_tool', input: {} },
      ],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Sorry, I cannot do that' }],
      usage: { input_tokens: 10, output_tokens: 10 },
    });

    const result = await runAgentWithLogging(agentConfig, context, userMessage);

    expect(result.output).toBe('Sorry, I cannot do that');
    expect(result.toolCalls[0].output).toBe('Error: Unknown tool "unknown_tool"');
    expect(result.toolCalls[0].tool).toBe('unknown_tool');
    
    expect(prisma.agentLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ level: 'error', message: 'Tool call: unknown_tool' }),
      }),
    );
  });

  it('should handle tool execution errors', async () => {
    const failingTool = {
      name: 'failing_tool',
      execute: vi.fn().mockRejectedValue(new Error('Execution failed')),
    };

    const configWithFailingTool = {
      ...agentConfig,
      tools: [failingTool],
    };

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tu-1', name: 'failing_tool', input: {} }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Error handled' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    const result = await runAgentWithLogging(configWithFailingTool, context, userMessage);

    expect(result.toolCalls[0].output).toBe('Tool error: Execution failed');
    expect(prisma.agentLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ level: 'error' }),
      }),
    );
  });

  it('should handle tool execution throwing non-Error objects', async () => {
    const badTool = {
      name: 'bad_tool',
      execute: vi.fn().mockRejectedValue('String error'),
    };

    const configWithBadTool = {
      ...agentConfig,
      tools: [badTool],
    };

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tu-1', name: 'bad_tool', input: {} }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Handled string error' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    const result = await runAgentWithLogging(configWithBadTool, context, userMessage);
    expect(result.toolCalls[0].output).toBe('Tool error: String error');
  });

  it('should truncate long outputs in logs and tool call logs', async () => {
    const longOutput = 'A'.repeat(2500);
    const longToolOutput = 'B'.repeat(600);

    const verboseTool = {
      name: 'verbose_tool',
      execute: vi.fn().mockResolvedValue(longToolOutput),
    };

    const configWithVerboseTool = {
      ...agentConfig,
      tools: [verboseTool],
    };

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tu-1', name: 'verbose_tool', input: {} }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: longOutput }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    const result = await runAgentWithLogging(configWithVerboseTool, context, userMessage);

    expect(result.toolCalls[0].output).toBe('B'.repeat(500) + '... [truncated]');
    expect(result.output).toBe(longOutput);

    const completionLog = vi.mocked(prisma.agentLog.create).mock.calls.find(
      (call) => call[0].data.message?.includes('completed'),
    );
    expect(completionLog?.[0].data.toolOutput).toBe('A'.repeat(2000) + '... [truncated]');
  });

  it('should return max iterations message when limit is reached', async () => {
    const maxIterConfig = { ...agentConfig, maxIterations: 2 };

    vi.mocked(chat).mockResolvedValue({
      content: [{ type: 'tool_use', id: 'tu-1', name: 'calculator', input: {} }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    const result = await runAgentWithLogging(maxIterConfig, context, userMessage);

    expect(result.output).toBe('Agent reached maximum iterations without completing.');
    expect(chat).toHaveBeenCalledTimes(2);

    expect(prisma.agentLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          level: 'warn',
          message: expect.stringContaining('reached maximum iterations (2)'),
        }),
      }),
    );
  });

  it('should log the agent start correctly', async () => {
    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Done' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    await runAgentWithLogging(agentConfig, context, userMessage);

    expect(prisma.agentLog.create).toHaveBeenNthCalledWith(1, {
      data: {
        agentId: 'agent-1',
        pipelineRunId: 'run-1',
        phase: 'research',
        level: 'info',
        message: 'Agent "TestAgent" started (phase: research)',
      },
    });
  });

  it('should properly pass messages back to the chat API after tool use', async () => {
    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tu-1', name: 'calculator', input: { expr: '1+1' } }],
      usage: { input_tokens: 10, output_tokens: 10 },
    });

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Final answer' }],
      usage: { input_tokens: 10, output_tokens: 10 },
    });

    await runAgentWithLogging(agentConfig, context, userMessage);

    // Note: messages is a mutable array reference shared across calls,
    // so toHaveBeenNthCalledWith sees the final state for all calls.
    // Verify chat was called twice and check the non-mutable args precisely.
    expect(chat).toHaveBeenCalledTimes(2);

    // Verify both calls share correct system, tools, maxTokens
    expect(vi.mocked(chat).mock.calls[0][0]).toMatchObject({
      system: agentConfig.systemPrompt,
      tools: agentConfig.tools,
      maxTokens: agentConfig.maxTokens,
    });

    expect(vi.mocked(chat).mock.calls[1][0]).toMatchObject({
      system: agentConfig.systemPrompt,
      tools: agentConfig.tools,
      maxTokens: agentConfig.maxTokens,
    });

    // Verify the messages array accumulated correctly (same ref, final state)
    const finalMessages = vi.mocked(chat).mock.calls[0][0].messages;
    expect(finalMessages).toEqual([
      { role: 'user', content: userMessage },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu-1', name: 'calculator', input: { expr: '1+1' } }],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu-1',
            content: '42',
          },
        ],
      },
    ]);
  });

  it('should handle a mix of text and tool_use blocks in response', async () => {
    vi.mocked(chat).mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'I will calculate that.' },
        { type: 'tool_use', id: 'tu-1', name: 'calculator', input: { expr: '2+2' } },
      ],
      usage: { input_tokens: 10, output_tokens: 10 },
    });

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'The result is 4.' }],
      usage: { input_tokens: 10, output_tokens: 10 },
    });

    const result = await runAgentWithLogging(agentConfig, context, userMessage);

    expect(result.output).toBe('The result is 4.');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].tool).toBe('calculator');
  });

  it('should log completion with duration and tokens', async () => {
    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Done' }],
      usage: { input_tokens: 50, output_tokens: 50 },
    });

    await runAgentWithLogging(agentConfig, context, userMessage);

    const completionCall = vi.mocked(prisma.agentLog.create).mock.calls.find(
      (call) => call[0].data.message?.includes('completed'),
    );

    expect(completionCall?.[0].data).toMatchObject({
      level: 'info',
      tokens: 100,
      toolOutput: 'Done',
    });
    expect(completionCall?.[0].data.duration).toBeGreaterThanOrEqual(0);
  });

  it('should log tool call duration correctly', async () => {
    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tu-1', name: 'calculator', input: {} }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Done' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    await runAgentWithLogging(agentConfig, context, userMessage);

    const toolLogCall = vi.mocked(prisma.agentLog.create).mock.calls.find(
      (call) => call[0].data.message === 'Tool call: calculator',
    );

    expect(toolLogCall?.[0].data).toMatchObject({
      level: 'info',
      toolName: 'calculator',
      toolInput: {},
      toolOutput: '42',
    });
    expect(toolLogCall?.[0].data.duration).toBeGreaterThanOrEqual(0);
  });

  it('should aggregate token usage across multiple iterations', async () => {
    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tu-1', name: 'calculator', input: {} }],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tu-2', name: 'calculator', input: {} }],
      usage: { input_tokens: 30, output_tokens: 40 },
    });

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Done' }],
      usage: { input_tokens: 50, output_tokens: 60 },
    });

    const result = await runAgentWithLogging(agentConfig, context, userMessage);

    expect(result.totalInputTokens).toBe(90);
    expect(result.totalOutputTokens).toBe(120);
  });

  it('should handle empty text parts in response', async () => {
    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: '' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    const result = await runAgentWithLogging(agentConfig, context, userMessage);
    expect(result.output).toBe('');
  });

  it('should handle multiple text parts joined with newline', async () => {
    vi.mocked(chat).mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'Line 1' },
        { type: 'text', text: 'Line 2' },
        { type: 'text', text: 'Line 3' },
      ],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    const result = await runAgentWithLogging(agentConfig, context, userMessage);
    expect(result.output).toBe('Line 1\nLine 2\nLine 3');
  });

  it('should pass is_error: true for unknown tools in tool results', async () => {
    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tu-1', name: 'nonexistent', input: {} }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Tool not found' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    await runAgentWithLogging(agentConfig, context, userMessage);

    const secondChatCall = vi.mocked(chat).mock.calls[1];
    const userMessageParam = secondChatCall[0].messages[2] as MessageParam;
    const toolResultContent = userMessageParam.content as ContentBlock[];

    expect(toolResultContent[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'tu-1',
      content: 'Error: Unknown tool "nonexistent"',
      is_error: true,
    });
  });

  it('should pass is_error: true for failing tools in tool results', async () => {
    const failingTool = {
      name: 'fail',
      execute: vi.fn().mockRejectedValue(new Error('Boom')),
    };

    const config = { ...agentConfig, tools: [failingTool] };

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tu-1', name: 'fail', input: {} }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Recovered' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    await runAgentWithLogging(config, context, userMessage);

    const secondChatCall = vi.mocked(chat).mock.calls[1];
    const userMessageParam = secondChatCall[0].messages[2] as MessageParam;
    const toolResultContent = userMessageParam.content as ContentBlock[];

    expect(toolResultContent[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'tu-1',
      content: 'Tool error: Boom',
      is_error: true,
    });
  });

  it('should not include is_error for successful tool results', async () => {
    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tu-1', name: 'calculator', input: {} }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Done' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    await runAgentWithLogging(agentConfig, context, userMessage);

    const secondChatCall = vi.mocked(chat).mock.calls[1];
    const userMessageParam = secondChatCall[0].messages[2] as MessageParam;
    const toolResultContent = userMessageParam.content as (ContentBlock & { is_error?: boolean })[];

    expect(toolResultContent[0].is_error).toBeUndefined();
    expect(toolResultContent[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'tu-1',
      content: '42',
    });
  });

  it('should handle maxIterations of 0', async () => {
    const zeroIterConfig = { ...agentConfig, maxIterations: 0 };

    const result = await runAgentWithLogging(zeroIterConfig, context, userMessage);

    expect(result.output).toBe('Agent reached maximum iterations without completing.');
    expect(chat).not.toHaveBeenCalled();
  });

  it('should handle single iteration with immediate completion', async () => {
    const oneIterConfig = { ...agentConfig, maxIterations: 1 };

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Quick answer' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    const result = await runAgentWithLogging(oneIterConfig, context, userMessage);
    expect(result.output).toBe('Quick answer');
  });

  it('should log tool input and output in the agent log', async () => {
    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tu-1', name: 'calculator', input: { expression: '2+2' } }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    vi.mocked(chat).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Done' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    await runAgentWithLogging(agentConfig, context, userMessage);

    expect(prisma.agentLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toolName: 'calculator',
          toolInput: { expression: '2+2' },
          toolOutput: '42',
        }),
      }),
    );
  });
});