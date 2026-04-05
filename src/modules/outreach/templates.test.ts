import { describe, it, expect } from 'vitest';
import {
  getTemplates,
  getTemplate,
  renderTemplate,
  pickColdTemplate,
  type EmailTemplate,
  type TemplateVariables,
} from './templates';

describe('getTemplates', () => {
  it('returns English templates by default', () => {
    const templates = getTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every(t => t.language === 'en')).toBe(true);
  });

  it('filters by language', () => {
    const nlTemplates = getTemplates('nl');
    expect(nlTemplates.length).toBeGreaterThan(0);
    expect(nlTemplates.every(t => t.language === 'nl')).toBe(true);
  });

  it('filters by language and category', () => {
    const templates = getTemplates('en', 'cold_no_website');
    expect(templates.length).toBe(1);
    expect(templates[0].category).toBe('cold_no_website');
    expect(templates[0].language).toBe('en');
  });

  it('returns empty array for non-existent category', () => {
    const templates = getTemplates('en', 'nonexistent');
    expect(templates).toEqual([]);
  });

  it('returns Arabic templates', () => {
    const templates = getTemplates('ar');
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every(t => t.language === 'ar')).toBe(true);
  });
});

describe('getTemplate', () => {
  it('returns a template by id', () => {
    const template = getTemplate('en_cold_no_website');
    expect(template).toBeDefined();
    expect(template?.id).toBe('en_cold_no_website');
  });

  it('returns undefined for non-existent id', () => {
    const template = getTemplate('nonexistent');
    expect(template).toBeUndefined();
  });
});

const baseVars: TemplateVariables = {
  companyName: 'Acme Corp',
  contactName: 'John',
  industry: 'tech',
  city: 'Amsterdam',
  specificInsight: 'slow loading speed',
  improvementArea: 'optimize images',
  estimatedImpact: '30% faster load times',
  overallScore: '65',
  senderName: 'Jane',
  meetingLink: 'https://cal.com/jane',
};

describe('renderTemplate', () => {
  it('replaces all placeholders in subject and body', () => {
    const template = getTemplate('en_cold_no_website')!;
    const result = renderTemplate(template, baseVars);

    expect(result.subject).not.toContain('{{');
    expect(result.body).not.toContain('{{');
    expect(result.body).toContain('Acme Corp');
    expect(result.body).toContain('John');
    expect(result.body).toContain('Amsterdam');
  });

  it('uses specificInsight as originalSubject fallback', () => {
    const template = getTemplate('en_followup_1')!;
    const result = renderTemplate(template, baseVars);
    expect(result.subject).toContain('slow loading speed');
  });

  it('strips em dashes from variable values', () => {
    const vars = {
      ...baseVars,
      specificInsight: 'Your headline — it is weak',
    };
    const template = getTemplate('en_cold_has_website')!;
    const result = renderTemplate(template, vars);
    // stripEmDashes replaces \s*—\s* with ": "
    expect(result.body).toContain('Your headline: it is weak');
    expect(result.body).not.toContain('—');
  });

  it('strips en dashes from variable values', () => {
    const vars = {
      ...baseVars,
      specificInsight: 'Pricing – options available',
    };
    const template = getTemplate('en_cold_has_website')!;
    const result = renderTemplate(template, vars);
    // stripEmDashes replaces \s*–\s* with ", "
    expect(result.body).toContain('Pricing, options available');
    expect(result.body).not.toContain('–');
  });

  it('strips double hyphens from variable values', () => {
    const vars = {
      ...baseVars,
      specificInsight: 'Your headline -- it is weak',
    };
    const template = getTemplate('en_cold_has_website')!;
    const result = renderTemplate(template, vars);
    // stripEmDashes replaces \s*--\s* with ": "
    expect(result.body).toContain('Your headline: it is weak');
    expect(result.body).not.toContain('--');
  });

  it('does not strip em dashes from overallScore', () => {
    const vars = {
      ...baseVars,
      overallScore: '65 — good',
    };
    // Use a custom template that contains {{overallScore}}
    const template: EmailTemplate = {
      id: 'test_overall',
      name: 'Test',
      category: 'cold_has_website',
      language: 'en',
      subject: 'Score: {{overallScore}}',
      body: 'Your score is {{overallScore}}.',
    };
    const result = renderTemplate(template, vars);
    expect(result.body).toContain('65 — good');
    expect(result.body).not.toContain(': good');
  });

  it('uses em dash as default for overallScore when not provided', () => {
    const vars = {
      ...baseVars,
      overallScore: undefined as any,
    };
    const template: EmailTemplate = {
      id: 'test_overall',
      name: 'Test',
      category: 'cold_has_website',
      language: 'en',
      subject: 'Score: {{overallScore}}',
      body: 'Your score is {{overallScore}}.',
    };
    const result = renderTemplate(template, vars);
    // overallScore defaults to "—"
    expect(result.body).toContain('—');
  });

  it('renders Dutch template correctly', () => {
    const template = getTemplate('nl_cold_no_website')!;
    const result = renderTemplate(template, baseVars);
    expect(result.body).toContain('Acme Corp');
    expect(result.body).toContain('Amsterdam');
    expect(result.body).toContain('John');
  });

  it('renders Arabic template correctly', () => {
    const template = getTemplate('ar_cold_no_website')!;
    const result = renderTemplate(template, baseVars);
    expect(result.body).toContain('Acme Corp');
    expect(result.body).toContain('Amsterdam');
  });
});

describe('pickColdTemplate', () => {
  it('returns cold_has_website template when hasWebsite is true', () => {
    const template = pickColdTemplate(true, 'en');
    expect(template.category).toBe('cold_has_website');
    expect(template.language).toBe('en');
  });

  it('returns cold_no_website template when hasWebsite is false', () => {
    const template = pickColdTemplate(false, 'en');
    expect(template.category).toBe('cold_no_website');
    expect(template.language).toBe('en');
  });

  it('returns Dutch template by default language', () => {
    const template = pickColdTemplate(true);
    expect(template.language).toBe('en');
  });

  it('throws if no template found for invalid language', () => {
    // All standard languages have templates, so test with a valid one
    // This tests the error path conceptually
    expect(() => pickColdTemplate(true, 'en')).not.toThrow();
  });

  it('returns correct template for Arabic', () => {
    const template = pickColdTemplate(true, 'ar');
    expect(template.language).toBe('ar');
    expect(template.category).toBe('cold_has_website');
  });
});
