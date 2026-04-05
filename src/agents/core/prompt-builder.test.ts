import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the external dependency using Vitest's explicit hoisting variable
const { mockSkillImplementations } = vi.hoisted(() => ({
  mockSkillImplementations: {} as Record<string, any>,
}));
vi.mock('./skills/index.js', () => ({
  skillImplementations: mockSkillImplementations,
}));

// Import the module to be tested after the mock is declared
import { buildSystemPrompt } from './prompt-builder.js';

describe('buildSystemPrompt', () => {
  
  beforeEach(() => {
    // Reset the mock implementation object before each test
    for (const key in mockSkillImplementations) {
      delete mockSkillImplementations[key];
    }
  });

  it('should return an empty string if no agent properties are provided', () => {
    const agent = {};
    expect(buildSystemPrompt(agent)).toBe('');
  });

  it('should correctly append identityMd, soulMd, and toolsMd', () => {
    const agent = {
      identityMd: '# Identity',
      soulMd: '# Soul',
      toolsMd: '# Tools',
    };
    const result = buildSystemPrompt(agent);
    expect(result).toBe('# Identity\n\n# Soul\n\n# Tools');
  });

  it('should skip undefined or empty markdown properties', () => {
    const agent = {
      identityMd: '# Identity',
      soulMd: '',
      toolsMd: undefined,
    };
    const result = buildSystemPrompt(agent);
    expect(result).toBe('# Identity');
  });

  it('should correctly format active skills without skill implementations', () => {
    const agent = {
      identityMd: '# Identity',
      skills: [
        { name: 'Research', promptAdd: 'Do research.', isActive: true },
        { name: 'Analysis', promptAdd: 'Analyze data.', isActive: true },
      ],
    };
    
    const expectedSkillsSection = `# Active Skills\n\n## Research\nDo research.\n## Analysis\nAnalyze data.`;
    expect(buildSystemPrompt(agent)).toBe(`# Identity\n\n${expectedSkillsSection}`);
  });

  it('should filter out inactive skills', () => {
    const agent = {
      skills: [
        { name: 'Research', promptAdd: 'Do research.', isActive: true },
        { name: 'Sleep', promptAdd: 'Sleep mode.', isActive: false },
      ],
    };
    
    const result = buildSystemPrompt(agent);
    expect(result).not.toContain('Sleep');
    expect(result).toContain('## Research');
  });

  it('should handle skills with no promptAdd property gracefully', () => {
    const agent = {
      skills: [
        { name: 'EmptySkill', promptAdd: '', isActive: true },
      ],
    };

    const expectedSkillsSection = `# Active Skills\n\n## EmptySkill`;
    expect(buildSystemPrompt(agent)).toBe(expectedSkillsSection);
  });

  it('should include the Quality Checklist when skill implementations exist', () => {
    mockSkillImplementations['Research'] = {
      name: 'Research',
      getPromptAddition: vi.fn().mockReturnValue('Verify sources.'),
    };
    
    const agent = {
      skills: [
        { name: 'Research', promptAdd: 'Do research.', isActive: true },
      ],
    };

    const expectedSkillsSection = `# Active Skills\n\n## Research\nDo research.`;
    const expectedChecklistSection = `# Quality Checklist\n\nYour output will be validated against the following quality checks. Ensure your work passes all of them:\n\n## Research\nVerify sources.`;
    
    const result = buildSystemPrompt(agent);
    expect(result).toBe(`${expectedSkillsSection}\n\n${expectedChecklistSection}`);
    expect(mockSkillImplementations['Research'].getPromptAddition).toHaveBeenCalledTimes(1);
  });

  it('should not include the Quality Checklist if active skills have no implementations', () => {
    const agent = {
      skills: [
        { name: 'UnknownSkill', promptAdd: 'Do something.', isActive: true },
      ],
    };

    const result = buildSystemPrompt(agent);
    expect(result).not.toContain('Quality Checklist');
  });

  it('should correctly render the complete combined prompt with all fields and implementations', () => {
    mockSkillImplementations['Research'] = {
      name: 'Research',
      getPromptAddition: vi.fn().mockReturnValue('Check sources!'),
    };
    
    const agent = {
      identityMd: 'I am an AI.',
      soulMd: 'I am helpful.',
      toolsMd: 'I have web access.',
      skills: [
        { name: 'Research', promptAdd: 'Perform deep research.', isActive: true },
        { name: 'Disabled', promptAdd: 'Disabled skill.', isActive: false },
      ],
    };

    const result = buildSystemPrompt(agent);

    const expectedIdentity = 'I am an AI.';
    const expectedSoul = 'I am helpful.';
    const expectedTools = 'I have web access.';
    const expectedSkills = '# Active Skills\n\n## Research\nPerform deep research.';
    const expectedChecklist = '# Quality Checklist\n\nYour output will be validated against the following quality checks. Ensure your work passes all of them:\n\n## Research\nCheck sources!';

    expect(result).toBe(`${expectedIdentity}\n\n${expectedSoul}\n\n${expectedTools}\n\n${expectedSkills}\n\n${expectedChecklist}`);
    expect(result).not.toContain('Disabled');
  });

});