// Unified Anthropic Messages API client with tool-use support and retry logic
// All AI calls go through this module — never duplicate fetch() calls elsewhere

import type { MessageParam, ContentBlock, AnthropicResponse, ToolDefinition } from "./types.js";

const API_KEY = process.env.GLM_API_KEY;
const BASE_URL = process.env.GLM_BASE_URL || "https://api.z.ai/api/anthropic";
const MODEL = process.env.GLM_MODEL || "claude-sonnet-4-20250514";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export interface ChatParams {
  system?: string;
  messages: MessageParam[];
  tools?: ToolDefinition[];
  maxTokens?: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function chat(params: ChatParams): Promise<AnthropicResponse> {
  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: params.maxTokens ?? 4096,
    messages: params.messages,
  };

  if (params.system) {
    body.system = params.system;
  }

  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools;
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY || "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        // Retry on server errors (500, 502, 503, 504) and rate limits (429)
        const isRetryable = response.status >= 500 || response.status === 429;
        if (isRetryable && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS * attempt;
          console.warn(`[AI Client] API error ${response.status}, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES}): ${text.slice(0, 200)}`);
          await sleep(delay);
          continue;
        }
        throw new Error(`AI API error (${response.status}): ${text}`);
      }

      return response.json() as Promise<AnthropicResponse>;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Network errors — retry
      if (attempt < MAX_RETRIES && (lastError.message.includes("fetch") || lastError.message.includes("ECONNREFUSED") || lastError.message.includes("timeout"))) {
        const delay = RETRY_DELAY_MS * attempt;
        console.warn(`[AI Client] Network error, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES}): ${lastError.message}`);
        await sleep(delay);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("AI API failed after all retries");
}

/** Simple text-only chat — for non-tool-use calls */
export async function simpleChat(
  prompt: string,
  options?: { system?: string; maxTokens?: number },
): Promise<string> {
  const result = await chat({
    system: options?.system,
    messages: [{ role: "user", content: prompt }],
    maxTokens: options?.maxTokens,
  });

  const textBlock = result.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Unexpected empty response from AI");
  }
  return textBlock.text;
}
