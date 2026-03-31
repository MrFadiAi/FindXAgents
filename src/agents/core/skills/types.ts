// Skill validation types — used by skills that validate tool output or agent behavior.

/** A skill that can validate tool output or agent behavior */
export interface AgentSkill {
  name: string;
  description: string;
  /** Validation function — returns issues found (empty = pass) */
  validate: (context: SkillValidationContext) => Promise<SkillIssue[]>;
  /** Prompt additions injected into agent's system prompt */
  getPromptAddition: () => string;
}

export interface SkillValidationContext {
  /** The agent's name */
  agentName: string;
  /** Tool call being validated (if applicable) */
  toolCall?: {
    name: string;
    input: Record<string, unknown>;
    output: unknown;
  };
  /** The full conversation so far */
  messages: Array<{ role: string; content: unknown }>;
  /** The agent's final output (only available at completion) */
  finalOutput?: string;
}

export interface SkillIssue {
  severity: "error" | "warning" | "info";
  message: string;
  suggestion?: string;
}
