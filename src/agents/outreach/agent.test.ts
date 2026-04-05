import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mock dependencies before importing anything that uses them ---
vi.mock('../tools/email-template.js', () => ({
  renderTemplateTool: {
    name: 'render_template',
    description: 'Renders an email template',
    execute: vi.fn(),
  },
}));

vi.mock('../tools/database.js', () => ({
  saveOutreachTool: {
    name: 'save_outreach',
    description: 'Saves outreach data',
    execute: vi.fn(),
  },
}));

import { createOutreachAgent } from './agent';
import { renderTemplateTool } from '../tools/email-template.js';
import { saveOutreachTool } from '../tools/database.js';

describe('createOutreachAgent', () => {
  it('should return a valid AgentConfig object', () => {
    const config = createOutreachAgent();

    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });

  it('should set the agent name to "outreach"', () => {
    const config = createOutreachAgent();
    expect(config.name).toBe('outreach');
  });

  it('should include a non-empty systemPrompt string', () => {
    const config = createOutreachAgent();
    expect(typeof config.systemPrompt).toBe('string');
    expect(config.systemPrompt.length).toBeGreaterThan(0);
  });

  it('should set maxIterations to 10', () => {
    const config = createOutreachAgent();
    expect(config.maxIterations).toBe(10);
  });

  it('should set maxTokens to 4096', () => {
    const config = createOutreachAgent();
    expect(config.maxTokens).toBe(4096);
  });

  it('should contain exactly 2 tools', () => {
    const config = createOutreachAgent();
    expect(config.tools).toHaveLength(2);
  });

  it('should include renderTemplateTool as the first tool', () => {
    const config = createOutreachAgent();
    expect(config.tools[0]).toBe(renderTemplateTool);
  });

  it('should include saveOutreachTool as the second tool', () => {
    const config = createOutreachAgent();
    expect(config.tools[1]).toBe(saveOutreachTool);
  });
});

describe('Outreach Agent System Prompt', () => {
  let systemPrompt: string;

  beforeEach(() => {
    const config = createOutreachAgent();
    systemPrompt = config.systemPrompt;
  });

  it('should explicitly forbid sending emails and enforce draft-only mode', () => {
    expect(systemPrompt).toMatch(/never send emails/i);
    expect(systemPrompt).toMatch(/only draft.*human review/i);
    expect(systemPrompt).toMatch(/do NOT send the email/i);
  });

  it('should mandate drafting two specific variants (Data-driven and Story-driven)', () => {
    expect(systemPrompt).toMatch(/variant a/i);
    expect(systemPrompt).toMatch(/data-driven/i);
    expect(systemPrompt).toMatch(/variant b/i);
    expect(systemPrompt).toMatch(/story-driven/i);
  });

  it('should require at least 2 specific findings for personalization', () => {
    expect(systemPrompt).toMatch(/at least 2 specific findings/i);
    expect(systemPrompt).toMatch(/generic emails are forbidden/i);
  });

  it('should enforce language handling for en, nl, and ar', () => {
    expect(systemPrompt).toMatch(/"en"/);
    expect(systemPrompt).toMatch(/"nl"/);
    expect(systemPrompt).toMatch(/"ar"/);
    expect(systemPrompt).toMatch(/always pass the language value/i);
  });

  it('should explicitly ban the use of em dashes', () => {
    expect(systemPrompt).toMatch(/never use em dashes/i);
  });

  it('should specify subject line constraints (length and style)', () => {
    expect(systemPrompt).toMatch(/under 50 characters/i);
    expect(systemPrompt).toMatch(/spark curiosity/i);
  });

  it('should ban forbidden corporate jargon words', () => {
    expect(systemPrompt).toMatch(/optimize/i);
    expect(systemPrompt).toMatch(/leverage/i);
    expect(systemPrompt).toMatch(/synergy/i);
    expect(systemPrompt).toMatch(/utilize/i);
    expect(systemPrompt).toMatch(/implement/i);
    expect(systemPrompt).toMatch(/no corporate jargon/i);
  });

  it('should ban including the website score/100', () => {
    expect(systemPrompt).toMatch(/never include the website score/i);
    expect(systemPrompt).toMatch(/do not invent data/i);
  });

  it('should require framing findings as opportunities, not criticism', () => {
    expect(systemPrompt).toMatch(/frame findings as opportunities/i);
    expect(systemPrompt).toMatch(/never as criticism/i);
  });

  it('should include the 200 words limit rule', () => {
    expect(systemPrompt).toMatch(/under 200 words/i);
  });

  it('should include instructions for insufficient data handling', () => {
    expect(systemPrompt).toMatch(/insufficient data for personalization/i);
  });

  it('should require a low-commitment call to action', () => {
    expect(systemPrompt).toMatch(/low-commitment call to action/i);
  });

  it('should instruct to output confirmation with variant subject lines', () => {
    expect(systemPrompt).toMatch(/output a brief confirmation/i);
    expect(systemPrompt).toMatch(/both variant subject lines/i);
  });

  it('should include the expected JSON input schema', () => {
    expect(systemPrompt).toMatch(/"language": "en" \| "nl" \| "ar"/);
    expect(systemPrompt).toMatch(/"lead"/);
    expect(systemPrompt).toMatch(/"analysis"/);
    expect(systemPrompt).toMatch(/"businessName"/);
    expect(systemPrompt).toMatch(/"score"/);
    expect(systemPrompt).toMatch(/"findings"/);
    expect(systemPrompt).toMatch(/"opportunities"/);
  });
});

describe('createOutreachAgent instances', () => {
  it('should return a new object on every call (no reference caching)', () => {
    const config1 = createOutreachAgent();
    const config2 = createOutreachAgent();
    
    expect(config1).not.toBe(config2);
    expect(config1).toEqual(config2);
  });

  it('should not share tool array references across instances', () => {
    const config1 = createOutreachAgent();
    const config2 = createOutreachAgent();
    
    expect(config1.tools).not.toBe(config2.tools);
  });

  it('should contain the exact same system prompt string consistently', () => {
    const config1 = createOutreachAgent();
    const config2 = createOutreachAgent();
    
    expect(config1.systemPrompt).toBe(config2.systemPrompt);
  });
});

describe('Tool Availability', () => {
  let config: ReturnType<typeof createOutreachAgent>;

  beforeEach(() => {
    config = createOutreachAgent();
  });

  it('should have an execute function on the render_template tool', () => {
    const tool = config.tools.find(t => t.name === 'render_template');
    expect(tool).toBeDefined();
    expect(tool!.execute).toBeTypeOf('function');
  });

  it('should have an execute function on the save_outreach tool', () => {
    const tool = config.tools.find(t => t.name === 'save_outreach');
    expect(tool).toBeDefined();
    expect(tool!.execute).toBeTypeOf('function');
  });
});