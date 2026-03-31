// Agent execution loop — sends messages, handles tool_use, repeats until done.
// Extended with logging: agent runs write AgentLog entries to DB for real-time monitoring.

import { chat } from "./client.js";
import { prisma } from "../../lib/db/client.js";
import type { AgentConfig, AgentRunResult, ToolCallLog, ContentBlock, ToolUseBlock, MessageParam } from "./types.js";

interface RunContext {
  agentId: string;
  pipelineRunId: string;
  phase: string;
}

/**
 * Run an agent with full tool-use loop and DB logging.
 * Returns the final output text, all tool call logs, and token usage.
 */
export async function runAgentWithLogging(
  agentConfig: AgentConfig & { id: string },
  context: RunContext,
  userMessage: string,
): Promise<AgentRunResult> {
  const toolCalls: ToolCallLog[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const messages: MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  // Log start
  await prisma.agentLog.create({
    data: {
      agentId: context.agentId,
      pipelineRunId: context.pipelineRunId,
      phase: context.phase,
      level: "info",
      message: `Agent "${agentConfig.name}" started (phase: ${context.phase})`,
    },
  });

  for (let i = 0; i < agentConfig.maxIterations; i++) {
    const startMs = Date.now();

    const response = await chat({
      system: agentConfig.systemPrompt,
      messages,
      tools: agentConfig.tools,
      maxTokens: agentConfig.maxTokens,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Collect text output and tool_use blocks
    const textParts: string[] = [];
    const toolUseBlocks: ToolUseBlock[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "tool_use") {
        toolUseBlocks.push(block);
      }
    }

    // If no tools requested, we are done
    if (toolUseBlocks.length === 0) {
      const output = textParts.join("\n");

      // Truncate log output to avoid filling the DB
      const truncatedOutput = output.length > 2000 ? output.slice(0, 2000) + "... [truncated]" : output;

      await prisma.agentLog.create({
        data: {
          agentId: context.agentId,
          pipelineRunId: context.pipelineRunId,
          phase: context.phase,
          level: "info",
          message: `Agent "${agentConfig.name}" completed`,
          tokens: response.usage.input_tokens + response.usage.output_tokens,
          duration: Date.now() - startMs,
          toolOutput: truncatedOutput,
        },
      });

      return { output, toolCalls, totalInputTokens, totalOutputTokens };
    }

    // Process tool calls in parallel using Promise.allSettled
    const toolResults: ContentBlock[] = [];

    // Build execution tasks — one per tool_use block
    const toolTasks = toolUseBlocks.map((toolUse) => {
      const tool = agentConfig.tools.find((t) => t.name === toolUse.name);

      return {
        toolUse,
        tool,
        promise: (async () => {
          // Unknown tool — return error immediately
          if (!tool) {
            return {
              toolUse,
              output: `Error: Unknown tool "${toolUse.name}"`,
              isError: true,
              duration: 0,
            };
          }

          const toolStart = Date.now();
          let toolOutput: string;
          let toolError = false;
          try {
            toolOutput = await tool.execute(toolUse.input);
          } catch (err) {
            toolError = true;
            toolOutput = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
          }
          const toolDuration = Date.now() - toolStart;

          return {
            toolUse,
            output: toolOutput,
            isError: toolError,
            duration: toolDuration,
          };
        })(),
      };
    });

    // Execute all tool calls concurrently — one failure won't stop the others
    const settled = await Promise.allSettled(toolTasks.map((t) => t.promise));

    for (const result of settled) {
      // Promise.allSettled always gives us a result, but guard against unexpected rejection
      if (result.status === "rejected") {
        // Should not happen since individual errors are caught above, but handle defensively
        const toolUse = toolTasks[settled.indexOf(result)].toolUse;
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Tool error: Unexpected failure during parallel execution`,
          is_error: true,
        } as ContentBlock & { is_error?: boolean });
        continue;
      }

      const { toolUse, output, isError, duration } = result.value;

      const callLog: ToolCallLog = {
        tool: toolUse.name,
        input: toolUse.input,
        output: output.length > 500 ? output.slice(0, 500) + "... [truncated]" : output,
        timestamp: new Date().toISOString(),
      };
      toolCalls.push(callLog);

      // Log tool call
      await prisma.agentLog.create({
        data: {
          agentId: context.agentId,
          pipelineRunId: context.pipelineRunId,
          phase: context.phase,
          level: isError ? "error" : "info",
          message: `Tool call: ${toolUse.name}`,
          toolName: toolUse.name,
          toolInput: toolUse.input as Record<string, string | number | boolean | null>,
          toolOutput: callLog.output,
          duration,
        },
      });

      const toolResult: ContentBlock & { is_error?: boolean } = {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: output as string,
        ...(isError ? { is_error: true } : {}),
      };
      toolResults.push(toolResult);
    }

    // Add assistant message with tool_use blocks and user message with tool results
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  // Safety limit reached
  await prisma.agentLog.create({
    data: {
      agentId: context.agentId,
      pipelineRunId: context.pipelineRunId,
      phase: context.phase,
      level: "warn",
      message: `Agent "${agentConfig.name}" reached maximum iterations (${agentConfig.maxIterations})`,
    },
  });

  return {
    output: "Agent reached maximum iterations without completing.",
    toolCalls,
    totalInputTokens,
    totalOutputTokens,
  };
}
