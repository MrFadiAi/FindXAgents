import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dutchEmailQuality } from './dutch-email-quality.js';
import type { SkillValidationContext } from './types.js';

describe('dutchEmailQuality', () => {
  describe('metadata', () => {
    it('should have the correct name', () => {
      expect(dutchEmailQuality.name).toBe('dutch-email-quality');
    });

    it('should have a description', () => {
      expect(dutchEmailQuality.description).toBeTruthy();
    });

    it('should have a validate method', () => {
      expect(typeof dutchEmailQuality.validate).toBe('function');
    });

    it('should have a getPromptAddition method', () => {
      expect(typeof dutchEmailQuality.getPromptAddition).toBe('function');
    });
  });

  describe('getPromptAddition', () => {
    it('should return guidelines string', async () => {
      const addition = dutchEmailQuality.getPromptAddition();
      expect(typeof addition).toBe('string');
      expect(addition.length).toBeGreaterThan(100);
    });

    it('should mention key rules', async () => {
      const addition = dutchEmailQuality.getPromptAddition();
      expect(addition).toContain('u/uw');
      expect(addition).toContain('200 words');
      expect(addition).toContain('subject line');
    });
  });

  describe('validate', () => {
    function createContext(partial: Partial<SkillValidationContext> = {}): SkillValidationContext {
      return {
        messages: partial.messages ?? [],
        finalOutput: partial.finalOutput ?? undefined,
        toolCall: partial.toolCall ?? undefined,
      } as SkillValidationContext;
    }

    describe('edge cases: insufficient content', () => {
      it('should return empty issues for empty context', async () => {
        const context = createContext();
        const issues = await dutchEmailQuality.validate(context);
        expect(issues).toEqual([]);
      });

      it('should return empty issues for empty finalOutput', async () => {
        const context = createContext({ finalOutput: '' });
        const issues = await dutchEmailQuality.validate(context);
        expect(issues).toEqual([]);
      });

      it('should return empty issues for text shorter than 20 characters', async () => {
        const context = createContext({ finalOutput: 'Short text' });
        const issues = await dutchEmailQuality.validate(context);
        expect(issues).toEqual([]);
      });

      it('should return empty issues for text with exactly 19 characters', async () => {
        const context = createContext({ finalOutput: 'a'.repeat(19) });
        const issues = await dutchEmailQuality.validate(context);
        expect(issues).toEqual([]);
      });

      it('should process text with exactly 20 characters', async () => {
        const context = createContext({ finalOutput: 'a'.repeat(20) });
        const issues = await dutchEmailQuality.validate(context);
        expect(Array.isArray(issues)).toBe(true);
      });
    });

    describe('text extraction: finalOutput', () => {
      it('should use finalOutput when available', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, wij willen u graag bedanken voor uw tijd en moeite.',
        });
        const issues = await dutchEmailQuality.validate(context);
        // Should not have mixed formality since only formal is used
        const formalityIssue = issues.find((i) => i.message.includes('Mixed formality'));
        expect(formalityIssue).toBeUndefined();
      });
    });

    describe('text extraction: toolCall', () => {
      it('should extract text from render_template tool call with string output', async () => {
        const context = createContext({
          toolCall: {
            name: 'render_template',
            output: 'Geachte mevrouw, wij willen u uitnodigen voor een kennismaking om uw bedrijf te bespreken.',
          },
        } as any);
        const issues = await dutchEmailQuality.validate(context);
        expect(Array.isArray(issues)).toBe(true);
      });

      it('should extract text from save_outreach tool call with string output', async () => {
        const context = createContext({
          toolCall: {
            name: 'save_outreach',
            output: 'Beste heer, ik wil graag met u praten over een samenwerking die voordelig kan zijn voor uw onderneming.',
          },
        } as any);
        const issues = await dutchEmailQuality.validate(context);
        expect(Array.isArray(issues)).toBe(true);
      });

      it('should extract text from tool call with body field', async () => {
        const context = createContext({
          toolCall: {
            name: 'render_template',
            output: {
              body: 'Geachte heer, wij willen u graag informeren over onze diensten en mogelijkheden voor uw organisatie.',
            },
          },
        } as any);
        const issues = await dutchEmailQuality.validate(context);
        expect(Array.isArray(issues)).toBe(true);
      });

      it('should extract text from tool call with content field', async () => {
        const context = createContext({
          toolCall: {
            name: 'render_template',
            output: {
              content: 'Beste mevrouw, onze oplossing kan u helpen bij het verbeteren van uw bedrijfsprocessen.',
            },
          },
        } as any);
        const issues = await dutchEmailQuality.validate(context);
        expect(Array.isArray(issues)).toBe(true);
      });

      it('should extract text from tool call with emailBody field', async () => {
        const context = createContext({
          toolCall: {
            name: 'save_outreach',
            output: {
              emailBody: 'Geachte heer, ik wil graag de mogelijkheid bespreken om uw team te ondersteunen.',
            },
          },
        } as any);
        const issues = await dutchEmailQuality.validate(context);
        expect(Array.isArray(issues)).toBe(true);
      });

      it('should JSON.stringify tool call output with unknown structure', async () => {
        const context = createContext({
          toolCall: {
            name: 'render_template',
            output: { data: 'Geachte heer, some content here that is at least twenty chars', extra: 'field' },
          },
        } as any);
        const issues = await dutchEmailQuality.validate(context);
        expect(Array.isArray(issues)).toBe(true);
      });

      it('should ignore tool calls with other names', async () => {
        const context = createContext({
          toolCall: {
            name: 'other_tool',
            output: 'Geachte heer, wij willen u graag bedanken voor uw tijd.',
          },
        } as any);
        // Since no finalOutput and toolCall name doesn't match, falls through to messages
        // No messages with length > 100, so text is empty => returns []
        const issues = await dutchEmailQuality.validate(context);
        expect(issues).toEqual([]);
      });
    });

    describe('text extraction: messages fallback', () => {
      it('should scan messages in reverse order for text > 100 chars', async () => {
        const longText = 'Geachte heer, wij willen u graag informeren over onze nieuwe diensten die uw bedrijf aanzienlijk kunnen verbeteren en optimaliseren voor de toekomst.';
        const context = createContext({
          messages: [
            { role: 'user', content: 'short' },
            { role: 'assistant', content: longText },
          ] as any,
        });
        const issues = await dutchEmailQuality.validate(context);
        expect(Array.isArray(issues)).toBe(true);
      });

      it('should skip messages shorter than 100 characters', async () => {
        const context = createContext({
          messages: [
            { role: 'assistant', content: 'Short message' },
          ] as any,
        });
        const issues = await dutchEmailQuality.validate(context);
        expect(issues).toEqual([]);
      });

      it('should handle messages with non-string content by JSON stringifying', async () => {
        const context = createContext({
          messages: [
            {
              role: 'assistant',
              content: [
                { type: 'text', text: 'Geachte heer, wij willen u informeren over onze diensten die zeer geschikt zijn voor uw bedrijf en uw team kunnen ondersteunen bij hun dagelijkse werkzaamheden.' },
              ],
            } as any,
          ],
        });
        const issues = await dutchEmailQuality.validate(context);
        // JSON.stringify of array should produce text > 100
        expect(Array.isArray(issues)).toBe(true);
      });

      it('should pick the last message with > 100 chars (reverse order)', async () => {
        const firstLong = 'a'.repeat(120) + ' beste heer, formal u content';
        const secondLong = 'b'.repeat(120) + ' geachte mevrouw, formal u content';
        const context = createContext({
          messages: [
            { role: 'assistant', content: firstLong } as any,
            { role: 'assistant', content: secondLong } as any,
          ],
        });
        const issues = await dutchEmailQuality.validate(context);
        expect(Array.isArray(issues)).toBe(true);
      });
    });

    describe('formality check', () => {
      it('should report error when mixing formal and informal address', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, ik wil u bedanken. Heb je onze brochure gezien? Jouw feedback is belangrijk.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const formalityIssue = issues.find((i) => i.message.includes('Mixed formality'));
        expect(formalityIssue).toBeDefined();
        expect(formalityIssue!.severity).toBe('error');
        expect(formalityIssue!.message).toContain('formal');
        expect(formalityIssue!.message).toContain('informal');
        expect(formalityIssue!.suggestion).toContain('u/uw');
      });

      it('should pass with only formal address (u, uw)', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, ik wil u en uw collega bedanken voor uw tijd en inzet.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const formalityIssue = issues.find((i) => i.message.includes('Mixed formality'));
        expect(formalityIssue).toBeUndefined();
      });

      it('should pass with only formal address (uwe, uwed)', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, uwe toewijding wordt op prijs gesteld. Wij danken u en uwed goedheid.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const formalityIssue = issues.find((i) => i.message.includes('Mixed formality'));
        expect(formalityIssue).toBeUndefined();
      });

      it('should pass with only informal address (je, jij, jouw, jullie)', async () => {
        const context = createContext({
          finalOutput: 'Hoi, heb je ons product gezien? Jij en jouw team kunnen hiermee aan de slag gaan.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const formalityIssue = issues.find((i) => i.message.includes('Mixed formality'));
        expect(formalityIssue).toBeUndefined();
      });

      it('should detect multiple formal and informal occurrences', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, u en uw team. Maar heb je dit gezien? Jij en jouw team ook bedankt. Uw bijdrage.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const formalityIssue = issues.find((i) => i.message.includes('Mixed formality'));
        expect(formalityIssue).toBeDefined();
        expect(formalityIssue!.message).toMatch(/found \d+ formal/);
        expect(formalityIssue!.message).toMatch(/\d+ informal/);
      });

      it('should be case-insensitive for formality check', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, U bent geweldig. Heb Je onze catalogus gezien?',
        });
        const issues = await dutchEmailQuality.validate(context);
        const formalityIssue = issues.find((i) => i.message.includes('Mixed formality'));
        expect(formalityIssue).toBeDefined();
      });
    });

    describe('anglicism check', () => {
      it('should detect anglicisms in email text', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, onze exciting nieuwe oplossing is een echte game-changer voor uw bedrijf.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const anglicismIssue = issues.find((i) => i.message.includes('anglicisms'));
        expect(anglicismIssue).toBeDefined();
        expect(anglicismIssue!.severity).toBe('warning');
        expect(anglicismIssue!.message).toContain('exciting');
        expect(anglicismIssue!.message).toContain('game-changer');
      });

      it('should detect "reach out" anglicism', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, feel free to reach out als u vragen heeft over onze diensten.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const anglicismIssue = issues.find((i) => i.message.includes('anglicisms'));
        expect(anglicismIssue).toBeDefined();
        expect(anglicismIssue!.message).toContain('reach out');
      });

      it('should detect "touch base" anglicism', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, ik wil graag touch base om onze samenwerking te bespreken in detail.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const anglicismIssue = issues.find((i) => i.message.includes('anglicisms'));
        expect(anglicismIssue).toBeDefined();
      });

      it('should detect "leverage" anglicism', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, u kunt leverage maken van onze expertise voor uw project.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const anglicismIssue = issues.find((i) => i.message.includes('anglicisms'));
        expect(anglicismIssue).toBeDefined();
      });

      it('should detect multiple anglicisms at once', async () => {
        const context = createContext({
          finalOutput: 'Onze innovative en cutting-edge oplossing helpt u move the needle met synergy en deep dive.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const anglicismIssue = issues.find((i) => i.message.includes('anglicisms'));
        expect(anglicismIssue).toBeDefined();
        expect(anglicismIssue!.message).toContain('innovative');
        expect(anglicismIssue!.message).toContain('cutting-edge');
        expect(anglicismIssue!.message).toContain('move the needle');
        expect(anglicismIssue!.message).toContain('synergy');
        expect(anglicismIssue!.message).toContain('deep dive');
      });

      it('should not flag clean Dutch text', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, wij willen u graag informeren over onze professionele diensten.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const anglicismIssue = issues.find((i) => i.message.includes('anglicisms'));
        expect(anglicismIssue).toBeUndefined();
      });

      it('should detect all individual anglicisms', async () => {
        const anglicisms = [
          'exciting', 'amazing', 'awesome', 'leverage', 'synergy', 'disrupt',
          'innovative', 'cutting-edge', 'game-changer', 'best-in-class',
          'reach out', 'touch base', 'circle back', 'move the needle',
          'deep dive', 'bandwidth', 'low-hanging fruit', 'pipeline',
        ];
        
        for (const word of anglicisms) {
          const context = createContext({
            finalOutput: `Geachte heer, ${word} is aanwezig in deze tekst voor uw referentie.`,
          });
          const issues = await dutchEmailQuality.validate(context);
          const anglicismIssue = issues.find((i) => i.message.includes('anglicisms'));
          expect(anglicismIssue, `Expected to find anglicism: "${word}"`).toBeDefined();
        }
      });

      it('should be case-insensitive for anglicism detection', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, ons EXCITING nieuwe product. TOUCH BASE met ons. LEVERAGE uw kansen.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const anglicismIssue = issues.find((i) => i.message.includes('anglicisms'));
        expect(anglicismIssue).toBeDefined();
      });
    });

    describe('word count check', () => {
      it('should warn when email exceeds 200 words', async () => {
        const words = Array(201).fill('woord').join(' ');
        const context = createContext({ finalOutput: words });
        const issues = await dutchEmailQuality.validate(context);
        const wordCountIssue = issues.find((i) => i.message.includes('200-word'));
        expect(wordCountIssue).toBeDefined();
        expect(wordCountIssue!.severity).toBe('warning');
        expect(wordCountIssue!.message).toContain('201 words');
      });

      it('should not warn when email is exactly 200 words', async () => {
        const words = Array(200).fill('woord').join(' ');
        const context = createContext({ finalOutput: words });
        const issues = await dutchEmailQuality.validate(context);
        const wordCountIssue = issues.find((i) => i.message.includes('200-word'));
        expect(wordCountIssue).toBeUndefined();
      });

      it('should not warn when email is under 200 words', async () => {
        const words = Array(50).fill('woord').join(' ');
        const context = createContext({ finalOutput: words });
        const issues = await dutchEmailQuality.validate(context);
        const wordCountIssue = issues.find((i) => i.message.includes('200-word'));
        expect(wordCountIssue).toBeUndefined();
      });

      it('should handle very long emails correctly', async () => {
        const words = Array(500).fill('woord').join(' ');
        const context = createContext({ finalOutput: words });
        const issues = await dutchEmailQuality.validate(context);
        const wordCountIssue = issues.find((i) => i.message.includes('200-word'));
        expect(wordCountIssue).toBeDefined();
        expect(wordCountIssue!.message).toContain('500 words');
      });

      it('should handle text with extra whitespace', async () => {
        const words = Array(201).fill('woord').join('   ');
        const context = createContext({ finalOutput: words });
        const issues = await dutchEmailQuality.validate(context);
        const wordCountIssue = issues.find((i) => i.message.includes('200-word'));
        expect(wordCountIssue).toBeDefined();
      });
    });

    describe('hype word check', () => {
      it('should detect hype words in email text', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, ons revolutionair product is baanbrekend voor de markt.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const hypeIssue = issues.find((i) => i.message.includes('hype'));
        expect(hypeIssue).toBeDefined();
        expect(hypeIssue!.severity).toBe('warning');
        expect(hypeIssue!.message).toContain('revolutionair');
        expect(hypeIssue!.message).toContain('baanbrekend');
      });

      it('should detect "verbluffend" hype word', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, de resultaten zijn verbluffend en ongeëvenaard in de industrie.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const hypeIssue = issues.find((i) => i.message.includes('hype'));
        expect(hypeIssue).toBeDefined();
        expect(hypeIssue!.message).toContain('verbluffend');
      });

      it('should detect English hype words', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, ons game-changing product is disruptive en next-gen.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const hypeIssue = issues.find((i) => i.message.includes('hype'));
        expect(hypeIssue).toBeDefined();
        expect(hypeIssue!.message).toContain('game-changing');
        expect(hypeIssue!.message).toContain('disruptive');
        expect(hypeIssue!.message).toContain('next-gen');
      });

      it('should not flag clean factual language', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, onze diensten zijn betrouwbaar en effectief gebleken in de praktijk.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const hypeIssue = issues.find((i) => i.message.includes('hype'));
        expect(hypeIssue).toBeUndefined();
      });

      it('should be case-insensitive for hype words', async () => {
        const context = createContext({
          finalOutput: 'Ons REVOLUTIONAIR product is BAANBREKEND.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const hypeIssue = issues.find((i) => i.message.includes('hype'));
        expect(hypeIssue).toBeDefined();
      });

      it('should detect "ongelooflijk" hype word', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, het is ongelooflijk wat onze samenwerking kan bereiken voor uw organisatie.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const hypeIssue = issues.find((i) => i.message.includes('hype'));
        expect(hypeIssue).toBeDefined();
      });
    });

    describe('subject line check', () => {
      it('should warn when email with greeting has no subject line', async () => {
        const context = createContext({
          finalOutput: 'Beste heer, ik wil u graag uitnodigen voor een kennismakingsgesprek over onze diensten.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const subjectIssue = issues.find((i) => i.message.includes('no subject'));
        expect(subjectIssue).toBeDefined();
        expect(subjectIssue!.severity).toBe('warning');
      });

      it('should warn when email with "geachte" has no subject line', async () => {
        const context = createContext({
          finalOutput: 'Geachte mevrouw, wij willen u informeren over onze nieuwe diensten voor uw bedrijf.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const subjectIssue = issues.find((i) => i.message.includes('no subject'));
        expect(subjectIssue).toBeDefined();
      });

      it('should warn when email with "best regards" has no subject line', async () => {
        const context = createContext({
          finalOutput: 'Bedankt voor uw tijd. Best regards, het team van FindX.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const subjectIssue = issues.find((i) => i.message.includes('no subject'));
        expect(subjectIssue).toBeDefined();
      });

      it('should not warn about missing subject when no greeting is present', async () => {
        const context = createContext({
          finalOutput: 'Dit is een algemene tekst die geen e-mail lijkt te zijn zonder begroeting of afsluiting.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const subjectIssue = issues.find((i) => i.message.includes('no subject'));
        expect(subjectIssue).toBeUndefined();
      });

      it('should extract subject line with "Subject:" prefix', async () => {
        const context = createContext({
          finalOutput: 'Subject: Uw uitnodiging\n\nGeachte heer, wij willen u uitnodigen voor onze bijeenkomst.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const noSubjectIssue = issues.find((i) => i.message.includes('no subject'));
        expect(noSubjectIssue).toBeUndefined();
      });

      it('should extract subject line with "Onderwerp:" prefix', async () => {
        const context = createContext({
          finalOutput: 'Onderwerp: Samenwerking\n\nBeste mevrouw, ik wil graag een samenwerking bespreken.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const noSubjectIssue = issues.find((i) => i.message.includes('no subject'));
        expect(noSubjectIssue).toBeUndefined();
      });

      it('should warn when subject line exceeds 8 words', async () => {
        const context = createContext({
          finalOutput: 'Subject: Een zeer lange onderwerpregel met veel te veel woorden erin geschreven\n\nBeste heer, inhoud.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const subjectLengthIssue = issues.find((i) => i.message.includes('Subject line is'));
        expect(subjectLengthIssue).toBeDefined();
        expect(subjectLengthIssue!.severity).toBe('info');
      });

      it('should not warn when subject line is exactly 8 words', async () => {
        const context = createContext({
          finalOutput: 'Subject: een twee drie vier vijf zes zeven acht\n\nBeste heer, inhoud hier.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const subjectLengthIssue = issues.find((i) => i.message.includes('Subject line is'));
        expect(subjectLengthIssue).toBeUndefined();
      });

      it('should not warn when subject line is under 8 words', async () => {
        const context = createContext({
          finalOutput: 'Subject: Uitnodiging\n\nBeste heer, bedankt voor uw tijd en aandacht voor onze diensten.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const subjectLengthIssue = issues.find((i) => i.message.includes('Subject line is'));
        expect(subjectLengthIssue).toBeUndefined();
      });

      it('should handle case-insensitive subject extraction', async () => {
        const context = createContext({
          finalOutput: 'SUBJECT: Samenwerking\n\nGeachte heer, wij willen samenwerken.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const noSubjectIssue = issues.find((i) => i.message.includes('no subject'));
        expect(noSubjectIssue).toBeUndefined();
      });

      it('should handle "onderwerp" case-insensitively', async () => {
        const context = createContext({
          finalOutput: 'ONDERWERP: Voorstel\n\nBeste mevrouw, hierbij ontvangt u ons voorstel voor uw organisatie.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const noSubjectIssue = issues.find((i) => i.message.includes('no subject'));
        expect(noSubjectIssue).toBeUndefined();
      });

      it('should handle subject with extra whitespace after colon', async () => {
        const context = createContext({
          finalOutput: 'Subject:   Uw uitnodiging voor gesprek\n\nBeste heer, bedankt voor uw interesse.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const noSubjectIssue = issues.find((i) => i.message.includes('no subject'));
        expect(noSubjectIssue).toBeUndefined();
      });
    });

    describe('happy path: clean Dutch email', () => {
      it('should return no issues for a clean, professional Dutch email', async () => {
        const context = createContext({
          finalOutput: `Subject: Samenwerking

Geachte heer,

Ik wil u graag informeren over onze diensten die uw organisatie kunnen ondersteunen.

Met vriendelijke groet,
Het team`,
        });
        const issues = await dutchEmailQuality.validate(context);
        expect(issues).toEqual([]);
      });

      it('should return no issues for formal email with uw only', async () => {
        const context = createContext({
          finalOutput: `Onderwerp: Uw account

Beste mevrouw,

Uw abonnement is vernieuwd. Bedankt voor uw vertrouwen.

Met vriendelijke groet.`,
        });
        const issues = await dutchEmailQuality.validate(context);
        const blockingIssues = issues.filter((i) => i.severity === 'error');
        expect(blockingIssues).toEqual([]);
      });
    });

    describe('multiple issues combined', () => {
      it('should report multiple issues simultaneously', async () => {
        const context = createContext({
          finalOutput: `Beste heer,

Ik wil u bedanken. Heb je onze exciting nieuwe revolutionair product gezien? Jouw feedback is belangrijk. ${Array(180).fill('woord').join(' ')}`,
        });
        const issues = await dutchEmailQuality.validate(context);
        
        const formalityIssue = issues.find((i) => i.message.includes('Mixed formality'));
        expect(formalityIssue).toBeDefined();
        
        const anglicismIssue = issues.find((i) => i.message.includes('anglicisms'));
        expect(anglicismIssue).toBeDefined();
        
        const hypeIssue = issues.find((i) => i.message.includes('hype'));
        expect(hypeIssue).toBeDefined();
        
        const subjectIssue = issues.find((i) => i.message.includes('no subject'));
        expect(subjectIssue).toBeDefined();
      });
    });

    describe('suggestion quality', () => {
      it('should include actionable suggestions for formality issue', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, u bent geweldig. Heb je onze diensten gezien?',
        });
        const issues = await dutchEmailQuality.validate(context);
        const formalityIssue = issues.find((i) => i.message.includes('Mixed formality'));
        expect(formalityIssue!.suggestion).toContain('u/uw');
      });

      it('should include actionable suggestions for anglicism issue', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, onze exciting oplossing is beschikbaar voor uw bedrijf.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const anglicismIssue = issues.find((i) => i.message.includes('anglicisms'));
        expect(anglicismIssue!.suggestion).toContain('Dutch');
      });

      it('should include actionable suggestions for word count issue', async () => {
        const context = createContext({
          finalOutput: Array(250).fill('woord').join(' '),
        });
        const issues = await dutchEmailQuality.validate(context);
        const wordCountIssue = issues.find((i) => i.message.includes('200-word'));
        expect(wordCountIssue!.suggestion).toContain('concise');
      });

      it('should include actionable suggestions for hype word issue', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, ons revolutionair product is beschikbaar voor uw organisatie.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const hypeIssue = issues.find((i) => i.message.includes('hype'));
        expect(hypeIssue!.suggestion).toContain('factual');
      });

      it('should include actionable suggestions for missing subject', async () => {
        const context = createContext({
          finalOutput: 'Beste heer, ik wil u informeren over onze diensten voor uw bedrijf.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const subjectIssue = issues.find((i) => i.message.includes('no subject'));
        expect(subjectIssue!.suggestion).toContain('Subject:');
      });

      it('should include actionable suggestions for long subject', async () => {
        const context = createContext({
          finalOutput: 'Subject: een twee drie vier vijf zes zeven acht negen tien\n\nBeste heer, inhoud.',
        });
        const issues = await dutchEmailQuality.validate(context);
        const subjectIssue = issues.find((i) => i.message.includes('Subject line is'));
        expect(subjectIssue!.suggestion).toContain('open rates');
      });
    });

    describe('text extraction priority', () => {
      it('should prefer finalOutput over toolCall and messages', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, dit is de finalOutput tekst die gebruikt moet worden voor validatie.',
          toolCall: {
            name: 'render_template',
            output: 'Beste heer, dit is de toolCall output met andere tekst voor validatie doeleinden.',
          },
          messages: [
            { role: 'assistant', content: 'Hoi, dit is een lange message tekst die meer dan honderd tekens bevat voor de test.' },
          ] as any,
        });
        const issues = await dutchEmailQuality.validate(context);
        // Should use finalOutput which has formal "u" language
        const formalityIssue = issues.find((i) => i.message.includes('Mixed formality'));
        expect(formalityIssue).toBeUndefined();
      });

      it('should prefer toolCall over messages when no finalOutput', async () => {
        const context = createContext({
          toolCall: {
            name: 'render_template',
            output: 'Geachte heer, dit komt van toolCall output en heeft formele taal.',
          },
          messages: [
            { role: 'assistant', content: 'Hoi, dit is een message met veel informele tekst en heeft meer dan honderd tekens lang.' },
          ] as any,
        });
        const issues = await dutchEmailQuality.validate(context);
        // Should use toolCall output
        const formalityIssue = issues.find((i) => i.message.includes('Mixed formality'));
        expect(formalityIssue).toBeUndefined();
      });
    });

    describe('validate returns a promise', () => {
      it('should return issues as a resolved promise', async () => {
        const context = createContext({
          finalOutput: 'Geachte heer, exciting revolutionair product.',
        });
        const result = dutchEmailQuality.validate(context);
        expect(result).toBeInstanceOf(Promise);
        const issues = await result;
        expect(Array.isArray(issues)).toBe(true);
      });
    });
  });
});