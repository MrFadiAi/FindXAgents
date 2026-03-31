// Agent system core types

/** JSON Schema for a tool's input — what the LLM sees */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** A tool the agent can invoke */
export interface Tool extends ToolDefinition {
  execute: (input: Record<string, unknown>) => Promise<string>;
}

/** Agent configuration — system prompt + available tools */
export interface AgentConfig {
  name: string;
  systemPrompt: string;
  tools: Tool[];
  maxIterations: number;
  maxTokens: number;
}

/** Result of a single agent run */
export interface AgentRunResult {
  output: string;
  toolCalls: ToolCallLog[];
  totalInputTokens: number;
  totalOutputTokens: number;
}

/** Log entry for one tool invocation */
export interface ToolCallLog {
  tool: string;
  input: Record<string, unknown>;
  output: string;
  timestamp: string;
}

// Anthropic Messages API content block types

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface MessageParam {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface AnthropicResponse {
  id: string;
  content: ContentBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens";
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}
