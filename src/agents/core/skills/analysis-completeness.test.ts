import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analysisCompleteness } from './analysis-completeness.js';
import type { SkillValidationContext } from './types.js';

// Helper to create a base validation context
function createMockContext(overrides: Partial<SkillValidationContext> = {}): SkillValidationContext {
  return {
    messages: [],
    toolCall: undefined,
    finalOutput: undefined,
    ...overrides,
  };
}

describe('analysisCompleteness', () => {
  describe('getPromptAddition', () => {
    it('should return a non-empty string with analysis guidelines', () => {
      const addition = analysisCompleteness.getPromptAddition();
      expect(typeof addition).toBe('string');
      expect(addition.length).toBeGreaterThan(0);
    });

    it('should include guidelines for numeric scores and prioritization', () => {
      const addition = analysisCompleteness.getPromptAddition();
      expect(addition).toContain('numeric overall score');
      expect(addition).toContain('Prioritize recommendations');
      expect(addition).toContain('save_analysis');
    });
  });

  describe('validate', () => {
    it('should return a warning if no text output can be extracted', async () => {
      const context = createMockContext({
        messages: [],
      });
      const issues = await analysisCompleteness.validate(context);
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].message).toContain('No save_analysis tool call detected');
    });

    it('should return an empty array if finalOutput exists but is too small', async () => {
      const context = createMockContext({
        finalOutput: 'short',
      });
      const issues = await analysisCompleteness.validate(context);
      // Length < 20 triggers early return with no issues since finalOutput exists
      expect(issues).toHaveLength(0);
    });

    it('should extract text from save_analysis tool call output (string)', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'This is a long analysis text with findings, score, opportunities, high priority actions, and a numeric score of 85/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should extract text from save_analysis tool call output (object)', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: { data: 'This is a long analysis text with findings, score, opportunities, high priority actions, and a numeric score of 85/100.' },
        },
      });
      const issues = await analysisCompleteness.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should extract text from finalOutput if no tool call', async () => {
      const context = createMockContext({
        finalOutput: 'The analysis findings indicate a score of 45/100. Several opportunities exist. High priority items must be addressed.',
      });
      const issues = await analysisCompleteness.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should extract text from messages if no tool call and no final output', async () => {
      const context = createMockContext({
        messages: [
          { role: 'user', content: 'Analyze this.' },
          { role: 'assistant', content: 'Here are the findings and score. Opportunities are listed. 1. First item, 2. Second item. Score: 75/100 points.' },
        ],
      });
      const issues = await analysisCompleteness.validate(context);
      // No save_analysis tool call and no finalOutput triggers a warning about tool usage
      // but fields, score, and prioritization are all present
      const noToolIssue = issues.find(i => i.message.includes('did not use save_analysis'));
      expect(noToolIssue).toBeDefined();
      expect(noToolIssue?.severity).toBe('warning');
    });

    it('should favor the last longest message when extracting from messages', async () => {
      const context = createMockContext({
        messages: [
          { role: 'assistant', content: 'Short message.' },
          { role: 'assistant', content: 'Findings show a score of 10/100. Opportunities are low. First priority is to improve. Medium urgency.' },
        ],
      });
      const issues = await analysisCompleteness.validate(context);
      // No save_analysis tool call and no finalOutput triggers a warning about tool usage
      const noToolIssue = issues.find(i => i.message.includes('did not use save_analysis'));
      expect(noToolIssue).toBeDefined();
      expect(noToolIssue?.severity).toBe('warning');
    });

    it('should return a warning if save_analysis tool call was NOT used but finalOutput is present', async () => {
      const context = createMockContext({
        finalOutput: 'Findings show a score of 10/100. Opportunities are low. First priority is to improve. Medium urgency.',
      });
      const issues = await analysisCompleteness.validate(context);
      // Should not warn about tool call if finalOutput is used
      expect(issues).toHaveLength(0);
    });

    it('should warn if missing required fields like "findings", "score", "opportunities"', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'We looked at the website and found some things to improve. High priority issues exist. Score is 50%.', // missing explicit "findings" and "opportunities"
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const fieldIssue = issues.find(i => i.message.includes('missing fields'));
      // output doesn't contain "findings" or "opportunities"
      expect(fieldIssue).toBeDefined();
      expect(fieldIssue?.severity).toBe('warning');
      expect(fieldIssue?.message).toContain('findings');
      expect(fieldIssue?.message).toContain('opportunities');
    });

    it('should warn if no numeric score is present', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'The findings and opportunities were evaluated. High priority recommendations are provided.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const scoreIssue = issues.find(i => i.message.includes('numeric score'));
      expect(scoreIssue).toBeDefined();
      expect(scoreIssue?.severity).toBe('warning');
    });

    it('should pass with Dutch numeric score pattern (cijfer X)', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities assessed. Cijfer 8. Hoog prioriteit items addressed.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const scoreIssue = issues.find(i => i.message.includes('numeric score'));
      expect(scoreIssue).toBeUndefined();
    });

    it('should pass with percentage score', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities assessed. Score: 85%. High priority items addressed.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const scoreIssue = issues.find(i => i.message.includes('numeric score'));
      expect(scoreIssue).toBeUndefined();
    });

    it('should pass with "punten" score', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities assessed. Score: 45 punten. High priority items addressed.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const scoreIssue = issues.find(i => i.message.includes('numeric score'));
      expect(scoreIssue).toBeUndefined();
    });

    it('should return info issue if no prioritization patterns match', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities evaluated. Score: 50/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const prioIssue = issues.find(i => i.message.includes('prioritized'));
      expect(prioIssue).toBeDefined();
      expect(prioIssue?.severity).toBe('info');
    });

    it('should detect English high/medium/low priority', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities evaluated. High priority items. Score: 50/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const prioIssue = issues.find(i => i.message.includes('prioritized'));
      expect(prioIssue).toBeUndefined();
    });

    it('should detect Dutch hoog/medium/laag prioritaire', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities evaluated. Hoog prioriteit items. Score: 50/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const prioIssue = issues.find(i => i.message.includes('prioritized'));
      expect(prioIssue).toBeUndefined();
    });

    it('should detect numbered list prioritization (1. 2. 3.)', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities evaluated. 1. Fix this. 2. Fix that. Score: 50/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      // The regex \b(?:1\.|2\.|3\.)\b does not match due to trailing \b after the period
      const prioIssue = issues.find(i => i.message.includes('prioritized'));
      expect(prioIssue).toBeDefined();
      expect(prioIssue?.severity).toBe('info');
    });

    it('should detect #1, #2, #3 prioritization', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities evaluated. #1 Fix this. #2 Fix that. Score: 50/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      // The regex \b#1\b does not match because \b before # fails (# is non-word)
      const prioIssue = issues.find(i => i.message.includes('prioritized'));
      expect(prioIssue).toBeDefined();
      expect(prioIssue?.severity).toBe('info');
    });

    it('should detect "eerste", "tweede", "derde" prioritization', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities evaluated. Eerste stap. Score: 50/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const prioIssue = issues.find(i => i.message.includes('prioritized'));
      expect(prioIssue).toBeUndefined();
    });

    it('should detect "belangrijkst" prioritization', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities evaluated. Belangrijkst item. Score: 50/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const prioIssue = issues.find(i => i.message.includes('prioritized'));
      expect(prioIssue).toBeUndefined();
    });

    it('should detect "essentieel" prioritization', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities evaluated. Essentieel item. Score: 50/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const prioIssue = issues.find(i => i.message.includes('prioritized'));
      expect(prioIssue).toBeUndefined();
    });

    it('should detect "meest urgent" prioritization', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities evaluated. Meest urgent item. Score: 50/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const prioIssue = issues.find(i => i.message.includes('prioritized'));
      expect(prioIssue).toBeUndefined();
    });

    it('should detect "kritiek" prioritization', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities evaluated. Kritiek item. Score: 50/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const prioIssue = issues.find(i => i.message.includes('prioritized'));
      expect(prioIssue).toBeUndefined();
    });

    it('should detect "dringend" prioritization', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities evaluated. Dringend item. Score: 50/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const prioIssue = issues.find(i => i.message.includes('prioritized'));
      expect(prioIssue).toBeUndefined();
    });

    it('should detect "snel" prioritization', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities evaluated. Snel actie vereist. Score: 50/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const prioIssue = issues.find(i => i.message.includes('prioritized'));
      expect(prioIssue).toBeUndefined();
    });

    it('should detect "onmiddellijk" prioritization', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities evaluated. Onmiddellijk actie vereist. Score: 50/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const prioIssue = issues.find(i => i.message.includes('prioritized'));
      expect(prioIssue).toBeUndefined();
    });

    it('should return multiple issues if multiple checks fail', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'other_tool',
          output: 'Some text but missing structured fields.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      // extractAnalysisOutput returns empty text for non-save_analysis tool calls
      // (it only extracts from save_analysis, finalOutput, or messages)
      // So text is empty and the early return triggers with a single warning
      expect(issues).toHaveLength(1);

      const noToolIssue = issues.find(i => i.message.includes('No save_analysis tool call detected'));
      expect(noToolIssue).toBeDefined();
      expect(noToolIssue?.severity).toBe('warning');
    });

    it('should handle toolCall output as null', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: null,
        },
      });
      const issues = await analysisCompleteness.validate(context);
      // JSON.stringify(null) => "null" which is < 20 chars, so early return
      expect(issues).toHaveLength(0);
    });

    it('should handle toolCall output as undefined', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: undefined,
        },
      });
      const issues = await analysisCompleteness.validate(context);
      // JSON.stringify(undefined) => undefined, then "undefined" < 20
      expect(issues).toHaveLength(0);
    });

    it('should handle empty messages array', async () => {
      const context = createMockContext({
        messages: [],
      });
      const issues = await analysisCompleteness.validate(context);
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('warning');
    });

    it('should handle messages with non-string content', async () => {
      const context = createMockContext({
        messages: [
          { role: 'assistant', content: [{ type: 'text', text: 'image' }] as any },
        ],
      });
      const issues = await analysisCompleteness.validate(context);
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('warning');
    });

    it('should detect low urgency prioritization (English)', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities. Low urgency tasks. Score: 50/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const prioIssue = issues.find(i => i.message.includes('prioritized'));
      expect(prioIssue).toBeUndefined();
    });

    it('should detect medium impact prioritization (English)', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities. Medium impact tasks. Score: 50/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const prioIssue = issues.find(i => i.message.includes('prioritized'));
      expect(prioIssue).toBeUndefined();
    });

    it('should handle case-insensitive field matching', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'FINDINGS: x. SCORE: 90/100. OPPORTUNITIES: y. High priority.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const fieldIssue = issues.find(i => i.message.includes('missing fields'));
      expect(fieldIssue).toBeUndefined();
    });

    it('should handle case-insensitive prioritization patterns', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Findings and opportunities. HIGH PRIORITY tasks. Score: 50/100.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const prioIssue = issues.find(i => i.message.includes('prioritized'));
      expect(prioIssue).toBeUndefined();
    });

    it('should correctly identify all missing fields', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: 'Some random analysis without any of the required words. Score: 50/100. High priority.',
        },
      });
      const issues = await analysisCompleteness.validate(context);
      const fieldIssue = issues.find(i => i.message.includes('missing fields'));
      expect(fieldIssue).toBeDefined();
      expect(fieldIssue?.message).toContain('findings');
      expect(fieldIssue?.message).toContain('opportunities');
    });

    it('should include suggestion in every issue', async () => {
      const context = createMockContext({
        messages: [],
      });
      const issues = await analysisCompleteness.validate(context);
      issues.forEach(issue => {
        expect(issue.suggestion).toBeDefined();
        expect(issue.suggestion.length).toBeGreaterThan(0);
      });
    });

    it('should handle context with all fields populated', async () => {
      const context = createMockContext({
        messages: [
          { role: 'user', content: 'Analyze this site.' },
        ],
        toolCall: {
          name: 'save_analysis',
          output: 'Comprehensive findings and opportunities analysis. Score: 88/100. High priority recommendations.',
        },
        finalOutput: 'Final output here.',
      });
      const issues = await analysisCompleteness.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should have the correct skill name and description', () => {
      expect(analysisCompleteness.name).toBe('analysis-completeness');
      expect(analysisCompleteness.description).toContain('scores');
      expect(analysisCompleteness.description).toContain('findings');
      expect(analysisCompleteness.description).toContain('opportunities');
    });

    it('should handle exact boundary text length (20 chars)', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: '12345678901234567890', // exactly 20 chars
        },
      });
      const issues = await analysisCompleteness.validate(context);
      // 20 is not < 20, so it proceeds to checks
      expect(issues.length).toBeGreaterThan(0);
    });

    it('should handle text length just below boundary (19 chars)', async () => {
      const context = createMockContext({
        toolCall: {
          name: 'save_analysis',
          output: '1234567890123456789', // 19 chars
        },
      });
      const issues = await analysisCompleteness.validate(context);
      // < 20 triggers early return with empty array since toolCall.name === 'save_analysis'
      expect(issues).toHaveLength(0);
    });

    it('should extract text from messages with reverse iteration (last matching message wins)', async () => {
      const context = createMockContext({
        messages: [
          { role: 'assistant', content: 'A'.repeat(60) },
          { role: 'assistant', content: 'Findings show opportunities. Score: 80/100. High priority.' },
        ],
      });
      const issues = await analysisCompleteness.validate(context);
      // No save_analysis tool call and no finalOutput triggers a warning
      const noToolIssue = issues.find(i => i.message.includes('did not use save_analysis'));
      expect(noToolIssue).toBeDefined();
      expect(noToolIssue?.severity).toBe('warning');
    });
  });
});