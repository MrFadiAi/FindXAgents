import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SkillValidationContext, AgentSkill } from './types.js';

// Import the module to test
// Note: In a real test environment, we might need to adjust import paths based on module resolution
import { outreachSpecificity } from './outreach-specificity.js';

// Helper function to create a partial SkillValidationContext
function createMockContext(overrides: Partial<SkillValidationContext> = {}): SkillValidationContext {
  return {
    messages: [],
    finalOutput: '',
    toolCall: undefined,
    ...overrides,
  } as SkillValidationContext;
}

describe('outreachSpecificity', () => {
  describe('metadata', () => {
    it('should have the correct skill name', () => {
      expect(outreachSpecificity.name).toBe('outreach-specificity');
    });

    it('should have a non-empty description', () => {
      expect(outreachSpecificity.description).toBeTruthy();
      expect(typeof outreachSpecificity.description).toBe('string');
    });

    it('should have a validate method', () => {
      expect(typeof outreachSpecificity.validate).toBe('function');
    });

    it('should have a getPromptAddition method', () => {
      expect(typeof outreachSpecificity.getPromptAddition).toBe('function');
    });
  });

  describe('getPromptAddition', () => {
    it('should return a non-empty string', () => {
      const result = outreachSpecificity.getPromptAddition();
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should include Outreach Specificity Guidelines header', () => {
      const result = outreachSpecificity.getPromptAddition();
      expect(result).toContain('Outreach Specificity Guidelines');
    });

    it('should mention at least 2 specific data points requirement', () => {
      const result = outreachSpecificity.getPromptAddition();
      expect(result.toLowerCase()).toContain('2 specific data points');
    });

    it('should include Dutch language example', () => {
      const result = outreachSpecificity.getPromptAddition();
      expect(result).toContain('Uw website scoort');
    });
  });

  describe('validate', () => {
    describe('text extraction from finalOutput', () => {
      it('should use finalOutput as primary text source', async () => {
        const context = createMockContext({
          finalOutput: 'Uw website scoort 45/100 op performance en gebruikt WordPress. De laadtijd is 3 seconden.',
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should find no issues when finalOutput has enough specific references', async () => {
        const context = createMockContext({
          finalOutput: 'Uw website heeft een score van 45. Wij hebben Google Analytics gedetecteerd en uw LCP is slecht.',
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should find issues when finalOutput has no specific references', async () => {
        const context = createMockContext({
          finalOutput: 'Beste klant, wij hebben uw website geanalyseerd en willen u helpen met verbeteringen. Met vriendelijke groet.',
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(1);
        expect(issues[0].severity).toBe('warning');
      });
    });

    describe('text extraction from toolCall output', () => {
      it('should extract text from toolCall output when it is a string', async () => {
        const context = createMockContext({
          toolCall: {
            name: 'send_email',
            output: 'Uw website scoort 45/100 op performance. WordPress wordt gebruikt met een rating van 3.5.',
          } as any,
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should extract text from toolCall output.body when body is a string', async () => {
        const context = createMockContext({
          toolCall: {
            name: 'send_email',
            output: {
              body: 'Uw website heeft een score van 72%. Wij vonden Google Analytics op uw site.',
            },
          } as any,
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should extract text from toolCall output.content when content is a string', async () => {
        const context = createMockContext({
          toolCall: {
            name: 'send_email',
            output: {
              content: 'Uw performance is 45/100. De React technologie wordt gebruikt. Verder zagen wij Hotjar.',
            },
          } as any,
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should find issues when toolCall output has no specific references', async () => {
        const context = createMockContext({
          toolCall: {
            name: 'send_email',
            output: {
              body: 'Beste klant, bedankt voor uw interesse. Wij willen u graag helpen met uw online aanwezigheid.',
            },
          } as any,
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(1);
        expect(issues[0].severity).toBe('warning');
      });
    });

    describe('text extraction from messages', () => {
      it('should scan messages in reverse for substantial content', async () => {
        const context = createMockContext({
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Uw website scoort 45/100 op performance en gebruikt WordPress met een rating van 4.2. Dit zijn onze bevindingen voor uw bedrijf.' },
          ] as any,
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should skip messages shorter than 100 characters', async () => {
        const context = createMockContext({
          messages: [
            { role: 'user', content: 'Short message' },
            { role: 'assistant', content: 'Also short' },
          ] as any,
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0); // Empty text returns no issues
      });

      it('should use the first substantial message in reverse order', async () => {
        const context = createMockContext({
          messages: [
            { role: 'user', content: 'This is a very long message that exceeds the hundred character limit but has no specific data references whatsoever.' },
            { role: 'assistant', content: 'Another very long message that exceeds the hundred character limit but has no specific data references whatsoever.' },
          ] as any,
        });

        const issues = await outreachSpecificity.validate(context);
        // Should check the assistant message (last in array, first in reverse)
        expect(issues).toHaveLength(1);
      });

      it('should handle messages with non-string content by JSON stringifying', async () => {
        const context = createMockContext({
          messages: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Uw website heeft een score van 85/100. Wij hebben Google Analytics en HubSpot aangetroffen.' }],
            },
          ] as any,
        });

        // JSON.stringify on array makes it > 100 chars, but pattern matching on JSON might not match well
        // This test verifies it doesn't crash
        const issues = await outreachSpecificity.validate(context);
        expect(Array.isArray(issues)).toBe(true);
      });
    });

    describe('boundary conditions', () => {
      it('should return empty issues when text is empty', async () => {
        const context = createMockContext({ finalOutput: '' });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should return empty issues when text is less than 20 characters', async () => {
        const context = createMockContext({ finalOutput: 'Short text' });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should return empty issues when exactly 19 characters', async () => {
        const context = createMockContext({ finalOutput: '1234567890123456789' });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should evaluate text when exactly 20 characters', async () => {
        const context = createMockContext({ finalOutput: '12345678901234567890' });
        const issues = await outreachSpecificity.validate(context);
        // 20 chars, no specific references - should have a warning
        expect(issues).toHaveLength(1);
        expect(issues[0].severity).toBe('warning');
      });

      it('should return empty issues when all fields are empty/undefined', async () => {
        const context = createMockContext({
          finalOutput: '',
          messages: [],
          toolCall: undefined,
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should handle null toolCall gracefully', async () => {
        const context = createMockContext({
          toolCall: null as any,
          finalOutput: '',
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });
    });

    describe('specific data pattern detection', () => {
      it('should detect score patterns like "score van 45"', async () => {
        const context = createMockContext({
          finalOutput: 'Uw website heeft een score van 45 op de test. Uw laadtijd is 3500 ms.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect percentage patterns like "72%"', async () => {
        const context = createMockContext({
          finalOutput: 'Uw website presteert op 72 procent van de benchmarks. Wij zien dat u WordPress gebruikt voor uw site.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect fraction patterns like "45/100"', async () => {
        const context = createMockContext({
          finalOutput: 'Uw website scoort 45/100 op onze analyse. Wij zien dat u WordPress gebruikt.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect technology names like WordPress', async () => {
        const context = createMockContext({
          finalOutput: 'Wij hebben ontdekt dat uw website WordPress gebruikt. Combineer dit met Google Analytics.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect technology names like Shopify', async () => {
        const context = createMockContext({
          finalOutput: 'Uw webshop draait op Shopify. Combineer dit met Mailchimp voor betere resultaten.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect technology names like React', async () => {
        const context = createMockContext({
          finalOutput: 'Uw applicatie is gebouwd met React frontend. Wij adviseren Google Analytics implementatie.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect technology names like Next.js and Node.js', async () => {
        const context = createMockContext({
          finalOutput: 'Uw stack bevat Nextjs en Nodejs technologieën. Uw score van 65 kan verbeterd worden.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect competitor/business names in quotes', async () => {
        const context = createMockContext({
          finalOutput: 'Uw concurrent "Acme Corp" heeft betere scores. Uw score van 45 laat ruimte voor verbetering.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect specific tools like Google Analytics', async () => {
        const context = createMockContext({
          finalOutput: 'Wij zien dat u Google Analytics gebruikt op uw website. Uw score van 34 is laag.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect Meta Pixel', async () => {
        const context = createMockContext({
          finalOutput: 'Meta Pixel is geïnstalleerd op uw website. Uw score is 45/100 op onze test.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect specific metrics with units like "5000 bezoekers"', async () => {
        const context = createMockContext({
          finalOutput: 'Uw website heeft 5000 bezoekers per maand en uw WordPress thema is verouderd.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect specific metrics with "werknemers"', async () => {
        const context = createMockContext({
          finalOutput: 'Met 250 werknemers en Google Tag Manager kunnen wij uw bedrijf helpen.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect Lighthouse performance scores', async () => {
        const context = createMockContext({
          finalOutput: 'Uw Lighthouse performance: 45 is onder de norm. Wij adviseren Hotjar voor monitoring.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect Core Web Vitals metrics like LCP, FID, CLS', async () => {
        const context = createMockContext({
          finalOutput: 'Uw LCP en FID scores zijn slecht. Uw website scoort 45/100 op performance.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect FCP and TTFB metrics', async () => {
        const context = createMockContext({
          finalOutput: 'Uw FCP en TTFB zijn te hoog. Wij adviseren WordPress optimalisatie voor uw site.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect INP metric', async () => {
        const context = createMockContext({
          finalOutput: 'Uw INP is slecht. Uw website heeft 3500 bezoekers en scoort 42/100.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect rating patterns like "cijfer 8"', async () => {
        const context = createMockContext({
          finalOutput: 'Uw website heeft cijfer 8 op gebruiksvriendelijkheid. Combineer dit met Clarity.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect "punten" in metrics', async () => {
        const context = createMockContext({
          finalOutput: 'Uw website heeft 85 punten op onze test. De Vue implementatie kan beter.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect milliseconds (ms) in metrics', async () => {
        const context = createMockContext({
          finalOutput: 'Uw laadtijd is 3500 ms. Dit is traag voor een WordPress site.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect MB and KB in metrics', async () => {
        const context = createMockContext({
          finalOutput: 'Uw pagina is 5 MB groot. Dit is te veel voor een Shopify webshop.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect "seconden" in metrics', async () => {
        const context = createMockContext({
          finalOutput: 'Laadtijd van 5 seconden is te langzaam. Uw Angular site scoort 35/100.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect multiple tools like HubSpot, Salesforce, Mailchimp', async () => {
        const context = createMockContext({
          finalOutput: 'Uw website gebruikt HubSpot voor marketing. Uw score van 45 kan verbeterd worden.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect Sendinblue tool', async () => {
        const context = createMockContext({
          finalOutput: 'Uw website gebruikt Sendinblue. Uw website heeft een score van 45 op onze test.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect "procent" pattern', async () => {
        const context = createMockContext({
          finalOutput: 'Uw website laadt 85 procent sneller dan gemiddeld. Wij adviseren jQuery update.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect Tailwind CSS technology', async () => {
        const context = createMockContext({
          finalOutput: 'Uw website gebruikt Tailwind CSS framework. Uw score van 65 kan beter.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect Bootstrap technology', async () => {
        const context = createMockContext({
          finalOutput: 'Uw website gebruikt Bootstrap framework. Uw score is 55/100 op mobile.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect pixels unit', async () => {
        const context = createMockContext({
          finalOutput: 'Uw afbeeldingen zijn 2000 pixels breed. Dit vertraagt uw Drupal site aanzienlijk.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect "klanten" metric', async () => {
        const context = createMockContext({
          finalOutput: 'Uw bedrijf heeft 500 klanten en uw Wix website kan beter geoptimaliseerd worden.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect accessibility and SEO scores', async () => {
        const context = createMockContext({
          finalOutput: 'Uw accessibility: 45 en SEO: 32 scores zijn laag. Joomla kan geholpen worden.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should detect best practices score', async () => {
        const context = createMockContext({
          finalOutput: 'Uw best practices: 55 score toont ruimte voor verbetering op uw Magento site.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });
    });

    describe('minimum specific references threshold', () => {
      it('should warn when text has 0 specific references', async () => {
        const context = createMockContext({
          finalOutput: 'Beste klant, wij hebben uw website geanalyseerd en willen u graag helpen met optimalisatie.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(1);
        expect(issues[0].severity).toBe('warning');
        expect(issues[0].message).toContain('0 specific data reference(s)');
      });

      it('should warn when text has only 1 specific reference', async () => {
        const context = createMockContext({
          finalOutput: 'Uw website gebruikt WordPress. Neem contact met ons op voor meer informatie en een vrijblijvend gesprek over uw online aanwezigheid.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(1);
        expect(issues[0].severity).toBe('warning');
        expect(issues[0].message).toContain('1 specific data reference(s)');
      });

      it('should not warn when text has exactly 2 specific references', async () => {
        const context = createMockContext({
          finalOutput: 'Uw website gebruikt WordPress en heeft een score van 45. Neem contact op voor verbetering.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should not warn when text has more than 2 specific references', async () => {
        const context = createMockContext({
          finalOutput: 'Uw WordPress website heeft een score van 45/100, laadtijd van 5 seconden, en geen Google Analytics.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });
    });

    describe('issue properties', () => {
      it('should include severity of "warning" in issues', async () => {
        const context = createMockContext({
          finalOutput: 'Geachte heer/mevrouw, wij hebben uw website bekeken en willen u helpen met verbeteringen.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues[0].severity).toBe('warning');
      });

      it('should include a descriptive message with count', async () => {
        const context = createMockContext({
          finalOutput: 'Geachte heer/mevrouw, wij hebben uw website bekeken en willen u helpen met verbeteringen.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues[0].message).toContain('specific data reference(s)');
        expect(issues[0].message).toContain('minimum: 2');
      });

      it('should include a helpful suggestion in issues', async () => {
        const context = createMockContext({
          finalOutput: 'Geachte heer/mevrouw, wij hebben uw website bekeken en willen u helpen met verbeteringen.',
        });
        const issues = await outreachSpecificity.validate(context);
        expect(issues[0].suggestion).toBeTruthy();
        expect(issues[0].suggestion).toContain('specific analysis findings');
        expect(issues[0].suggestion).toContain('website scores');
        expect(issues[0].suggestion).toContain('Generic emails');
      });
    });

    describe('priority of text extraction', () => {
      it('should prefer finalOutput over toolCall', async () => {
        const context = createMockContext({
          finalOutput: 'Uw website scoort 45/100 op performance en gebruikt WordPress.',
          toolCall: {
            name: 'send_email',
            output: 'Generic email without specific data references at all.',
          } as any,
        });

        const issues = await outreachSpecificity.validate(context);
        // Should use finalOutput which has specific refs
        expect(issues).toHaveLength(0);
      });

      it('should prefer toolCall over messages', async () => {
        const context = createMockContext({
          toolCall: {
            name: 'send_email',
            output: 'Uw website scoort 45/100 op performance en gebruikt WordPress.',
          } as any,
          messages: [
            {
              role: 'assistant',
              content: 'Generic long message without any specific data references or scores or metrics to speak of whatsoever.',
            },
          ] as any,
        });

        const issues = await outreachSpecificity.validate(context);
        // Should use toolCall output which has specific refs
        expect(issues).toHaveLength(0);
      });

      it('should fall back to messages when finalOutput and toolCall are empty', async () => {
        const context = createMockContext({
          finalOutput: '',
          toolCall: undefined,
          messages: [
            {
              role: 'assistant',
              content: 'Uw website scoort 45/100 op performance en gebruikt WordPress. Dit is een uitgebreid rapport.',
            },
          ] as any,
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });
    });

    describe('edge cases with text extraction', () => {
      it('should handle toolCall with non-object, non-string output', async () => {
        const context = createMockContext({
          toolCall: {
            name: 'send_email',
            output: 42 as any,
          } as any,
          messages: [
            {
              role: 'assistant',
              content: 'Uw website scoort 45/100 op performance en gebruikt WordPress. Dit rapport bevat onze bevindingen.',
            },
          ] as any,
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should handle toolCall output object without body or content', async () => {
        const context = createMockContext({
          toolCall: {
            name: 'send_email',
            output: { data: 'something' },
          } as any,
          messages: [
            {
              role: 'assistant',
              content: 'Uw website scoort 45/100 op performance en gebruikt WordPress. Dit rapport bevat onze bevindingen.',
            },
          ] as any,
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should handle toolCall output with null', async () => {
        const context = createMockContext({
          toolCall: {
            name: 'send_email',
            output: null,
          } as any,
          messages: [
            {
              role: 'assistant',
              content: 'Uw website scoort 45/100 op performance en gebruikt WordPress. Dit rapport bevat onze bevindingen.',
            },
          ] as any,
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should handle toolCall output.body as non-string', async () => {
        const context = createMockContext({
          toolCall: {
            name: 'send_email',
            output: { body: { nested: 'object' } },
          } as any,
          messages: [
            {
              role: 'assistant',
              content: 'Uw website scoort 45/100 op performance en gebruikt WordPress. Dit rapport bevat onze bevindingen.',
            },
          ] as any,
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });
    });

    describe('real-world outreach scenarios', () => {
      it('should pass a well-crafted Dutch outreach email with specific data', async () => {
        const context = createMockContext({
          finalOutput: `Beste klant,

Wij hebben uw website geanalyseerd en de volgende bevindingen gedaan:

- Uw website scoort 45/100 op performance
- De laadtijd is 4.5 seconden
- Uw site is gebouwd met WordPress
- Google Analytics ontbreekt
- LCP is 6500 ms

Wij kunnen u helpen deze problemen op te lossen.

Met vriendelijke groet,
FindX Team`,
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should warn on a generic outreach email', async () => {
        const context = createMockContext({
          finalOutput: `Beste klant,

Wij hebben uw website bekeken en denken dat wij u kunnen helpen met uw online aanwezigheid.

Ons team van experts staat klaar om u te adviseren over de mogelijkheden voor uw bedrijf.

Met vriendelijke groet,
FindX Team`,
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(1);
        expect(issues[0].severity).toBe('warning');
      });

      it('should pass an email mentioning specific competitors', async () => {
        const context = createMockContext({
          finalOutput: `Beste klant,

In vergelijking met "MediaMarkt" scoort uw website 35% lager op performance. Uw Shopify winkel kan sterk verbeterd worden.

Met vriendelijke groet,
FindX Team`,
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });

      it('should handle mixed language content with specific data', async () => {
        const context = createMockContext({
          finalOutput: 'Your Vue.js application has a performance score of 42. We recommend implementing Google Analytics for better tracking.',
        });

        const issues = await outreachSpecificity.validate(context);
        expect(issues).toHaveLength(0);
      });
    });

    describe('async behavior', () => {
      it('should return a promise that resolves to an array', async () => {
        const context = createMockContext({ finalOutput: '' });
        const result = outreachSpecificity.validate(context);
        expect(result).toBeInstanceOf(Promise);
        const issues = await result;
        expect(Array.isArray(issues)).toBe(true);
      });
    });
  });
});

describe('SPECIFIC_DATA_PATTERNS', () => {
  // Testing patterns indirectly through the validate function
  describe('score and metric patterns', () => {
    it('should detect decimal scores like "score van 4.5"', async () => {
      const context = createMockContext({
        finalOutput: 'Uw website heeft een score van 4.5 op gebruiksvriendelijkheid. Combineer dit met Mailchimp integratie.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect "rating van 8" pattern', async () => {
      const context = createMockContext({
        finalOutput: 'Uw website heeft een rating van 8 op onze schaal. Wij adviseren Squarespace migratie.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });
  });

  describe('technology detection', () => {
    it('should detect PHP technology', async () => {
      const context = createMockContext({
        finalOutput: 'Uw website draait op PHP versie 7.x. Combineer dit met Google Analytics voor betere resultaten.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect Python technology', async () => {
      const context = createMockContext({
        finalOutput: 'Uw backend is gebouwd met Python. Uw score van 65 op performance kan beter.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect Ruby technology', async () => {
      const context = createMockContext({
        finalOutput: 'Uw applicatie gebruikt Ruby backend. Uw rating van 4.5 op onze beoordelingsschaal.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect Laravel technology', async () => {
      const context = createMockContext({
        finalOutput: 'Uw website gebruikt Laravel framework. De performance: 55 is onder gemiddeld.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect Symfony technology', async () => {
      const context = createMockContext({
        finalOutput: 'Uw website gebruikt Symfony framework. Uw Google Tag Manager is correct geïmplementeerd.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect AngularJS technology', async () => {
      const context = createMockContext({
        finalOutput: 'Uw website gebruikt AngularJS framework. Uw score van 38/100 kan verbeterd worden.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect Vue.js technology', async () => {
      const context = createMockContext({
        finalOutput: 'Uw website gebruikt Vuejs framework. Uw Meta Pixel ontbreekt op de landingspagina.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect Magento technology', async () => {
      const context = createMockContext({
        finalOutput: 'Uw webshop draait op Magento. Wij adviseren Facebook Pixel voor conversie tracking.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect Drupal technology', async () => {
      const context = createMockContext({
        finalOutput: 'Uw website draait op Drupal CMS. Uw score van 42 op SEO kan verbeterd worden.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect Joomla technology', async () => {
      const context = createMockContext({
        finalOutput: 'Uw website draait op Joomla CMS. Uw Google Analytics is niet correct geïmplementeerd.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect Wix technology', async () => {
      const context = createMockContext({
        finalOutput: 'Uw website is gebouwd met Wix platform. Uw laadtijd van 4500 ms is te hoog.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect Squarespace technology', async () => {
      const context = createMockContext({
        finalOutput: 'Uw website is gebouwd met Squarespace. Uw score is 55/100 op onze analyse.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });
  });

  describe('tools and platforms detection', () => {
    it('should detect Google Tag Manager', async () => {
      const context = createMockContext({
        finalOutput: 'Uw website gebruikt Google Tag Manager. Uw CLS score is 0.35 wat te hoog is.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect Hotjar', async () => {
      const context = createMockContext({
        finalOutput: 'Uw website heeft Hotjar geïnstalleerd. Uw score van 68% op performance kan beter.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect Clarity', async () => {
      const context = createMockContext({
        finalOutput: 'Uw website gebruikt Clarity voor heatmap analyse. Uw score van 45/100 op mobile is laag.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect Facebook Pixel', async () => {
      const context = createMockContext({
        finalOutput: 'Uw website heeft Facebook Pixel geïnstalleerd. Uw laadtijd is 3500 ms op desktop.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });
  });

  describe('core web vitals detection', () => {
    it('should detect CLS metric', async () => {
      const context = createMockContext({
        finalOutput: 'Uw CLS is 0.45 wat boven de drempelwaarde ligt. Uw WordPress thema kan geoptimaliseerd worden.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect FCP metric', async () => {
      const context = createMockContext({
        finalOutput: 'Uw FCP is 3.5 seconden wat te traag is. Uw React applicatie kan beter presteren.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });

    it('should detect TTFB metric', async () => {
      const context = createMockContext({
        finalOutput: 'Uw TTFB is 800 ms wat te hoog is. Uw WordPress site kan sneller laden.',
      });
      const issues = await outreachSpecificity.validate(context);
      expect(issues).toHaveLength(0);
    });
  });
});