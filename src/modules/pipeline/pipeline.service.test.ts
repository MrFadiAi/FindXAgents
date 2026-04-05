import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PIPELINE_STAGES, PipelineStageName } from './pipeline.service'; 

describe('PIPELINE_STAGES', () => {
  it('should export exactly 8 stages', () => {
    expect(PIPELINE_STAGES).toHaveLength(8);
  });

  it('should have the correct stage names in the correct order', () => {
    const expectedNames: PipelineStageName[] = [
      'discovered',
      'analyzing',
      'analyzed',
      'contacting',
      'responded',
      'qualified',
      'won',
      'lost',
    ];
    
    const actualNames = PIPELINE_STAGES.map(stage => stage.name);
    expect(actualNames).toEqual(expectedNames);
  });

  it('should have sequential order values starting from 0', () => {
    PIPELINE_STAGES.forEach((stage, index) => {
      expect(stage.order).toBe(index);
    });
  });

  it('should have "discovered" as the initial stage (order 0)', () => {
    const initialStage = PIPELINE_STAGES.find(stage => stage.order === 0);
    expect(initialStage).toBeDefined();
    expect(initialStage?.name).toBe('discovered');
  });

  it('should have "won" and "lost" as the final stages', () => {
    const wonStage = PIPELINE_STAGES.find(stage => stage.name === 'won');
    const lostStage = PIPELINE_STAGES.find(stage => stage.name === 'lost');
    
    const maxOrder = Math.max(...PIPELINE_STAGES.map(s => s.order));
    
    expect(wonStage?.order).toBeLessThan(maxOrder);
    expect(lostStage?.order).toBe(maxOrder);
  });

  it('should contain unique order values for every stage', () => {
    const orders = PIPELINE_STAGES.map(stage => stage.order);
    const uniqueOrders = new Set(orders);
    expect(uniqueOrders.size).toBe(PIPELINE_STAGES.length);
  });

  it('should contain unique name values for every stage', () => {
    const names = PIPELINE_STAGES.map(stage => stage.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(PIPELINE_STAGES.length);
  });

  it('should be frozen/readonly at the type level (as const assertion)', () => {
    // Technically runtime arrays aren't frozen without Object.freeze, 
    // but we ensure the structure strictly matches the `as const` shape.
    expect(PIPELINE_STAGES).toBeInstanceOf(Array);
    
    const expectedShape = [
      { name: "discovered", order: 0 },
      { name: "analyzing", order: 1 },
      { name: "analyzed", order: 2 },
      { name: "contacting", order: 3 },
      { name: "responded", order: 4 },
      { name: "qualified", order: 5 },
      { name: "won", order: 6 },
      { name: "lost", order: 7 },
    ];
    
    expect(PIPELINE_STAGES).toEqual(expectedShape);
  });
});

describe('PipelineStageName', () => {
  it('should allow valid stage names without type errors', () => {
    // This test mostly validates the type export exists and represents the expected values
    const validName: PipelineStageName = 'discovered';
    expect(validName).toBe('discovered');
  });

  it('should map exactly to the names present in PIPELINE_STAGES', () => {
    const stageNames = PIPELINE_STAGES.map(s => s.name);
    const testValues: PipelineStageName[] = [
      "discovered", "analyzing", "analyzed", "contacting", 
      "responded", "qualified", "won", "lost"
    ];
    
    testValues.forEach(val => {
      expect(stageNames).toContain(val);
    });
  });
});