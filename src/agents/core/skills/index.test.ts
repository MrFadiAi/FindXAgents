import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { skillImplementations } from './index.js';
import type { AgentSkill } from './types.js';
import { dutchEmailQuality } from './dutch-email-quality.js';
import { outreachSpecificity } from './outreach-specificity.js';
import { analysisCompleteness } from './analysis-completeness.js';

// ─────────────────────────────────────────────────────────────────
// NOTE: We do NOT mock the three sub-modules here.  The barrel file
// under test only re-exports and aggregates, so we want to assert
// against the *real* references it rehydrates via its local imports.
// ─────────────────────────────────────────────────────────────────

describe('src/agents/core/skills/index', () => {
  // ── skillImplementations map ──────────────────────────────────
  describe('skillImplementations', () => {
    it('should be a plain object (Record<string, AgentSkill>)', () => {
      expect(typeof skillImplementations).toBe('object');
      expect(skillImplementations).not.toBeNull();
      expect(Array.isArray(skillImplementations)).toBe(false);
    });

    it('should contain exactly 3 keys', () => {
      const keys = Object.keys(skillImplementations);
      expect(keys).toHaveLength(3);
    });

    it('should contain the expected skill name keys', () => {
      const keys = Object.keys(skillImplementations);
      expect(keys).toContain('dutch-email-quality');
      expect(keys).toContain('outreach-specificity');
      expect(keys).toContain('analysis-completeness');
    });

    it('should map "dutch-email-quality" to the dutchEmailQuality skill', () => {
      expect(skillImplementations['dutch-email-quality']).toBe(dutchEmailQuality);
    });

    it('should map "outreach-specificity" to the outreachSpecificity skill', () => {
      expect(skillImplementations['outreach-specificity']).toBe(outreachSpecificity);
    });

    it('should map "analysis-completeness" to the analysisCompleteness skill', () => {
      expect(skillImplementations['analysis-completeness']).toBe(analysisCompleteness);
    });

    it('should return undefined for an unknown skill name', () => {
      expect(skillImplementations['non-existent-skill']).toBeUndefined();
    });

    it('should return undefined for an empty string key', () => {
      expect(skillImplementations['']).toBeUndefined();
    });

    it('should have every value implementing the AgentSkill interface (has required properties)', () => {
      for (const [name, skill] of Object.entries(skillImplementations)) {
        expect(skill).toBeDefined();
        // AgentSkill must at minimum expose a `validate` function and `getPromptAddition`.
        // We perform a duck-type check without relying on internals.
        expect(
          typeof (skill as Record<string, unknown>).validate,
          `Skill "${name}" must expose a validate method`
        ).toBe('function');
        expect(
          typeof (skill as Record<string, unknown>).getPromptAddition,
          `Skill "${name}" must expose a getPromptAddition method`
        ).toBe('function');
      }
    });

    it('should not have any null or undefined values', () => {
      for (const [name, skill] of Object.entries(skillImplementations)) {
        expect(skill, `Skill "${name}" should not be null or undefined`).toBeDefined();
        expect(skill).not.toBeNull();
      }
    });

    it('should be a mutable record (can add a new skill at runtime)', () => {
      const originalCount = Object.keys(skillImplementations).length;
      const dummySkill = { execute: vi.fn() } as unknown as AgentSkill;
      skillImplementations['test-dummy-skill'] = dummySkill;
      expect(skillImplementations['test-dummy-skill']).toBe(dummySkill);
      expect(Object.keys(skillImplementations)).toHaveLength(originalCount + 1);
      // Cleanup to keep other tests pure
      delete (skillImplementations as Record<string, unknown>)['test-dummy-skill'];
    });

    it('should not contain duplicate references for different keys', () => {
      const values = Object.values(skillImplementations);
      const uniqueValues = new Set(values);
      // Each key should point to a distinct implementation object
      expect(uniqueValues.size).toBe(values.length);
    });
  });

  // ── re-export verification ────────────────────────────────────
  describe('re-exports', () => {
    // We dynamically import the module to verify re-exports surface
    // the expected members.  Because Vitest already loaded the module
    // above, we rely on the cache and perform a fresh import().
    it('should re-export dutchEmailQuality as a named export', async () => {
      const mod = await import('./index.js');
      expect(mod.dutchEmailQuality).toBe(dutchEmailQuality);
    });

    it('should re-export outreachSpecificity as a named export', async () => {
      const mod = await import('./index.js');
      expect(mod.outreachSpecificity).toBe(outreachSpecificity);
    });

    it('should re-export analysisCompleteness as a named export', async () => {
      const mod = await import('./index.js');
      expect(mod.analysisCompleteness).toBe(analysisCompleteness);
    });

    it('should re-export the skillImplementations map', async () => {
      const mod = await import('./index.js');
      expect(mod.skillImplementations).toBe(skillImplementations);
    });
  });

  // ── boundary / edge cases ─────────────────────────────────────
  describe('edge cases', () => {
    it('should handle Object.keys on an empty-string key gracefully', () => {
      // Even if someone accidentally mutates the record with '' key
      const keys = Object.keys(skillImplementations);
      // Current implementation should not have '' key
      expect(keys.includes('')).toBe(false);
    });

    it('should not include inherited prototype properties', () => {
      const keys = Object.keys(skillImplementations);
      expect(keys.includes('toString')).toBe(false);
      expect(keys.includes('hasOwnProperty')).toBe(false);
      expect(keys.includes('constructor')).toBe(false);
    });

    it('should allow iteration via Object.entries without error', () => {
      const entries = Object.entries(skillImplementations);
      expect(entries.length).toBe(3);
      for (const [key, value] of entries) {
        expect(typeof key).toBe('string');
        expect(value).toBeDefined();
      }
    });

    it('should allow iteration via Object.values without error', () => {
      const values = Object.values(skillImplementations);
      expect(values.length).toBe(3);
      for (const value of values) {
        expect(value).toBeDefined();
      }
    });

    it('should survive JSON.stringify without throwing (no circular refs)', () => {
      // JSON.stringify will drop function properties, but should not throw
      expect(() => JSON.stringify(skillImplementations)).not.toThrow();
    });

    it('should reflect changes if a sub-module is mocked dynamically', async () => {
      // Verify the skillImplementations record references whatever the
      // sub-modules resolve to at import time.  In production those are
      // real implementations; under test Vitest may substitute mocks.
      const { dutchEmailQuality: deq } = await import('./dutch-email-quality.js');
      // They should be the same reference used in the map
      expect(skillImplementations['dutch-email-quality']).toBe(deq);
    });
  });
});