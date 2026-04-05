import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentOrchestrator } from './orchestrator.js';

// Mocks for external dependencies
vi.mock('../../lib/db/client.js', () => ({
  prisma: {
    agentPipelineRun: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    lead: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../core/agent-registry.js', () => ({
  loadAgentConfig: vi.fn(),
}));

vi.mock('../core/runner.js', () => ({
  runAgentWithLogging: vi.fn(),
}));

import { prisma } from '../../lib/db/client.js';
import { loadAgentConfig } from '../core/agent-registry.js';
import { runAgentWithLogging } from '../core/runner.js';

const mockedPrisma = vi.mocked(prisma);
const mockedLoadAgentConfig = vi.mocked(loadAgentConfig);
const mockedRunAgentWithLogging = vi.mocked(runAgentWithLogging);

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;

  const basePipelineInput = {
    pipelineRunId: 'pipe-123',
    query: 'Find plumbers in Amsterdam',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new AgentOrchestrator();
  });

  describe('runPipeline', () => {
    const mockResearchAgent = { id: 'agent-research' };
    const mockAnalysisAgent = { id: 'agent-analysis' };
    const mockOutreachAgent = { id: 'agent-outreach' };

    beforeEach(() => {
      // Default mocks
      mockedPrisma.agentPipelineRun.update.mockResolvedValue({ id: 'pipe-123', status: 'running' } as any);
      mockedPrisma.agentPipelineRun.findUnique.mockResolvedValue({ id: 'pipe-123', status: 'running' } as any);
      
      mockedLoadAgentConfig.mockImplementation(async (name: string) => {
        if (name === 'research') return mockResearchAgent as any;
        if (name === 'analysis') return mockAnalysisAgent as any;
        if (name === 'outreach') return mockOutreachAgent as any;
        return {} as any;
      });

      // Default: research finds 1 lead, no fallback needed
      mockedRunAgentWithLogging.mockResolvedValue({
        toolCalls: [
          { tool: 'save_lead', output: JSON.stringify({ id: 'lead-1' }) },
        ],
      } as any);

      // Default: DB fetches the lead with a website and analysis
      mockedPrisma.lead.findMany.mockImplementation((args: any) => {
        if (args?.where?.analyses) {
          // Outreach phase
          return Promise.resolve([
            {
              id: 'lead-1',
              businessName: 'Lead 1',
              website: 'https://lead1.com',
              city: 'Amsterdam',
              industry: 'Plumbing',
              email: 'lead1@test.com',
              phone: '123',
              analyses: [{ score: 80, findings: 'Good', opportunities: 'Grow', socialPresence: '', competitors: '', serviceGaps: '', revenueImpact: '' }],
            },
          ]);
        }
        // Analysis phase
        return Promise.resolve([
          {
            id: 'lead-1',
            businessName: 'Lead 1',
            website: 'https://lead1.com',
            city: 'Amsterdam',
            industry: 'Plumbing',
            email: 'lead1@test.com',
            phone: '123',
            analyses: [],
          },
        ]);
      });
    });

    it('should execute the full pipeline successfully (happy path)', async () => {
      const result = await orchestrator.runPipeline(basePipelineInput);

      expect(result.status).toBe('completed');
      expect(result.pipelineRunId).toBe('pipe-123');
      expect(result.totalLeadsDiscovered).toBe(1);
      expect(result.totalLeadsAnalyzed).toBe(1);
      expect(result.totalOutreachSent).toBe(1);
      expect(result.errors).toEqual([]);

      // Check DB updates
      expect(mockedPrisma.agentPipelineRun.update).toHaveBeenCalledTimes(4); // running, leadsFound, leadsAnalyzed, finalize

      // Check agent calls
      expect(mockedRunAgentWithLogging).toHaveBeenCalledTimes(3); // research, analysis, outreach
    });

    it('should complete with 0 leads and no errors if research finds nothing', async () => {
      mockedRunAgentWithLogging.mockResolvedValue({ toolCalls: [] } as any);

      const result = await orchestrator.runPipeline(basePipelineInput);

      expect(result.status).toBe('completed');
      expect(result.totalLeadsDiscovered).toBe(0);
      expect(result.totalLeadsAnalyzed).toBe(0);
      expect(result.totalOutreachSent).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it('should return "failed" if pipeline was cancelled during execution', async () => {
      mockedPrisma.agentPipelineRun.findUnique.mockResolvedValue({ id: 'pipe-123', status: 'cancelled' } as any);

      const result = await orchestrator.runPipeline(basePipelineInput);

      expect(result.status).toBe('failed');
      expect(result.errors).toContain('Pipeline was cancelled');
    });

    it('should append maxResults limit to the research prompt if specified', async () => {
      const input = { ...basePipelineInput, maxResults: 5 };
      await orchestrator.runPipeline(input);

      const researchCall = mockedRunAgentWithLogging.mock.calls[0];
      const prompt = researchCall[2] as string;
      
      expect(prompt).toContain('IMPORTANT: Find at most 5 businesses.');
    });

    it('should not modify the prompt if maxResults is undefined', async () => {
      await orchestrator.runPipeline(basePipelineInput);

      const researchCall = mockedRunAgentWithLogging.mock.calls[0];
      const prompt = researchCall[2] as string;
      
      expect(prompt).not.toContain('IMPORTANT: Find at most');
      expect(prompt).toBe(basePipelineInput.query);
    });

    it('should enforce a hard cap on maxResults by slicing lead IDs', async () => {
      mockedRunAgentWithLogging.mockResolvedValueOnce({
        toolCalls: [
          { tool: 'save_lead', output: JSON.stringify({ id: 'lead-1' }) },
          { tool: 'save_lead', output: JSON.stringify({ id: 'lead-2' }) },
          { tool: 'save_lead', output: JSON.stringify({ id: 'lead-3' }) },
        ],
      } as any);

      const input = { ...basePipelineInput, maxResults: 2 };
      const result = await orchestrator.runPipeline(input);

      // Should cap discovered leads to 2
      expect(result.totalLeadsDiscovered).toBe(2);
      
      // Should only fetch and analyze 2 leads
      const analysisPhaseFindMany = mockedPrisma.lead.findMany.mock.calls[0][0] as any;
      expect(analysisPhaseFindMany.where.id.in).toHaveLength(2);
    });

    it('should skip analysis if no leads have websites', async () => {
      mockedPrisma.lead.findMany.mockImplementation((args: any) => {
        if (args?.where?.analyses) {
          // Outreach phase — no leads have analyses
          return Promise.resolve([]);
        }
        // Analysis phase — lead has no website
        return Promise.resolve([
          {
            id: 'lead-1',
            businessName: 'Lead 1',
            website: null,
            city: 'Amsterdam',
            industry: 'Plumbing',
            email: 'lead1@test.com',
            phone: '123',
            analyses: [],
          },
        ] as any);
      });

      const result = await orchestrator.runPipeline(basePipelineInput);

      expect(result.totalLeadsAnalyzed).toBe(0);
      expect(result.totalOutreachSent).toBe(0);
      // Should not have called runAgentWithLogging for analysis or outreach
      expect(mockedRunAgentWithLogging).toHaveBeenCalledTimes(1); // Only research
    });

    it('should retry analysis with extended timeout if a timeout error occurs', async () => {
      const timeoutError = new Error('Request timed out');
      
      // Research succeeds
      mockedRunAgentWithLogging.mockResolvedValueOnce({
        toolCalls: [{ tool: 'save_lead', output: JSON.stringify({ id: 'lead-1' }) }],
      } as any);

      // First analysis attempt throws timeout
      mockedRunAgentWithLogging.mockRejectedValueOnce(timeoutError);
      
      // Retry analysis succeeds
      mockedRunAgentWithLogging.mockResolvedValueOnce({ toolCalls: [] } as any);
      
      // Outreach succeeds
      mockedRunAgentWithLogging.mockResolvedValueOnce({ toolCalls: [] } as any);

      const result = await orchestrator.runPipeline(basePipelineInput);

      expect(result.totalLeadsAnalyzed).toBe(1); // Succeeded on retry
      expect(result.errors).toEqual([]);
      expect(mockedRunAgentWithLogging).toHaveBeenCalledTimes(4); // 1 research + 2 analysis + 1 outreach
    });

    it('should push an error if both analysis and analysis retry fail', async () => {
      const timeoutError = new Error('Request timed out');
      const retryError = new Error('Retry also timed out');

      // Call 0: research succeeds
      mockedRunAgentWithLogging.mockResolvedValueOnce({
        toolCalls: [{ tool: 'save_lead', output: JSON.stringify({ id: 'lead-1' }) }],
      } as any);
      // Call 1: analysis throws timeout
      mockedRunAgentWithLogging.mockRejectedValueOnce(timeoutError);
      // Call 2: retry analysis also fails
      mockedRunAgentWithLogging.mockRejectedValueOnce(retryError);

      const result = await orchestrator.runPipeline(basePipelineInput);

      expect(result.totalLeadsAnalyzed).toBe(0);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Analysis failed (timeout) for Lead 1');
      expect(result.errors[0]).toContain('Retry also timed out');
    });

    it('should push an error immediately if analysis fails without a timeout', async () => {
      const fatalError = new Error('Agent malformed response');

      // Call 0: research succeeds
      mockedRunAgentWithLogging.mockResolvedValueOnce({
        toolCalls: [{ tool: 'save_lead', output: JSON.stringify({ id: 'lead-1' }) }],
      } as any);

      // Call 1: analysis fails (non-timeout)
      mockedRunAgentWithLogging.mockRejectedValueOnce(fatalError);

      // Outreach phase: no analyzed leads (analysis failed)
      mockedPrisma.lead.findMany.mockImplementation((args: any) => {
        if (args?.where?.analyses) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          {
            id: 'lead-1',
            businessName: 'Lead 1',
            website: 'https://lead1.com',
            city: 'Amsterdam',
            industry: 'Plumbing',
            email: 'lead1@test.com',
            phone: '123',
            analyses: [],
          },
        ] as any);
      });

      const result = await orchestrator.runPipeline(basePipelineInput);

      expect(result.totalLeadsAnalyzed).toBe(0);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Analysis failed for Lead 1: Agent malformed response');
      // Should not retry — only research + 1 analysis attempt
      expect(mockedRunAgentWithLogging).toHaveBeenCalledTimes(2);
    });

    it('should skip outreach for leads that have no analysis', async () => {
      mockedRunAgentWithLogging.mockResolvedValueOnce({
        toolCalls: [{ tool: 'save_lead', output: JSON.stringify({ id: 'lead-1' }) }],
      } as any);

      // Mock analysis phase to return lead with website
      mockedPrisma.lead.findMany.mockResolvedValueOnce([
        {
          id: 'lead-1',
          businessName: 'Lead 1',
          website: 'https://lead1.com',
          city: 'Amsterdam',
          industry: 'Plumbing',
          email: 'lead1@test.com',
          phone: '123',
          analyses: [],
        },
      ] as any);

      // Mock outreach phase to return empty (lead has no analyses matching query)
      mockedPrisma.lead.findMany.mockResolvedValueOnce([] as any);

      const result = await orchestrator.runPipeline(basePipelineInput);

      expect(result.totalLeadsAnalyzed).toBe(1);
      expect(result.totalOutreachSent).toBe(0);
    });

    it('should handle outreach failures gracefully', async () => {
      const outreachError = new Error('SMTP server down');
      
      mockedRunAgentWithLogging.mockResolvedValueOnce({
        toolCalls: [{ tool: 'save_lead', output: JSON.stringify({ id: 'lead-1' }) }],
      } as any);
      mockedRunAgentWithLogging.mockResolvedValueOnce({ toolCalls: [] } as any); // analysis ok
      mockedRunAgentWithLogging.mockRejectedValueOnce(outreachError); // outreach fails

      const result = await orchestrator.runPipeline(basePipelineInput);

      expect(result.totalOutreachSent).toBe(0);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Outreach failed for Lead 1: SMTP server down');
    });

    it('should format outreach prompt with correct language based on input', async () => {
      const input = { ...basePipelineInput, language: 'nl' as const };
      await orchestrator.runPipeline(input);

      // Call order: 0=research, 1=analysis, 2=outreach
      const outreachCall = mockedRunAgentWithLogging.mock.calls[2];
      const prompt = outreachCall[2] as string;

      expect(prompt).toContain('Write this email in Dutch');
      expect(prompt).toContain('"language": "nl"');
    });

    it('should default to English language for outreach if not specified', async () => {
      await orchestrator.runPipeline(basePipelineInput);

      const outreachCall = mockedRunAgentWithLogging.mock.calls[2];
      const prompt = outreachCall[2] as string;

      expect(prompt).toContain('Write this email in English');
      expect(prompt).toContain('"language": "en"');
    });

    it('should set status to "partial" if progress is made but errors occur', async () => {
      // Research succeeds
      mockedRunAgentWithLogging.mockResolvedValueOnce({
        toolCalls: [{ tool: 'save_lead', output: JSON.stringify({ id: 'lead-1' }) }],
      } as any);
      // Analysis succeeds
      mockedRunAgentWithLogging.mockResolvedValueOnce({ toolCalls: [] } as any);
      // Outreach fails
      mockedRunAgentWithLogging.mockRejectedValueOnce(new Error('Outreach failure'));

      const result = await orchestrator.runPipeline(basePipelineInput);

      // Analysis succeeded, so progress > 0, but errors array has items
      expect(result.status).toBe('partial');
      expect(result.totalLeadsAnalyzed).toBe(1);
    });

    it('should set status to "failed" if no progress and errors occur', async () => {
      // Make the very first DB update throw to trigger the outer catch
      mockedPrisma.agentPipelineRun.update.mockRejectedValueOnce(new Error('DB Connection Lost'));

      const result = await orchestrator.runPipeline(basePipelineInput);

      expect(result.status).toBe('failed');
      expect(result.errors[0]).toContain('Pipeline error: DB Connection Lost');
    });

    describe('Research Fallbacks', () => {
      it('should attempt a broader query without city if initial research returns 0 leads', async () => {
        // First call (initial) -> 0 leads
        mockedRunAgentWithLogging.mockResolvedValueOnce({ toolCalls: [] } as any);
        // Second call (broader) -> 1 lead
        mockedRunAgentWithLogging.mockResolvedValueOnce({
          toolCalls: [{ tool: 'save_lead', output: JSON.stringify({ id: 'lead-fallback' }) }],
        } as any);

        const result = await orchestrator.runPipeline(basePipelineInput);

        expect(result.totalLeadsDiscovered).toBe(1);
        
        const broaderPrompt = mockedRunAgentWithLogging.mock.calls[1][2] as string;
        // "in Amsterdam" should be stripped
        expect(broaderPrompt).toBe('Find plumbers');
      });

      it('should attempt a web_search fallback if broader query still returns 0 leads', async () => {
        // Call 1: Initial query -> 0 leads
        mockedRunAgentWithLogging.mockResolvedValueOnce({ toolCalls: [] } as any);
        // Call 2: Broader query -> 0 leads
        mockedRunAgentWithLogging.mockResolvedValueOnce({ toolCalls: [] } as any);
        // Call 3: Web search -> 1 lead
        mockedRunAgentWithLogging.mockResolvedValueOnce({
          toolCalls: [{ tool: 'save_lead', output: JSON.stringify({ id: 'lead-web' }) }],
        } as any);

        const result = await orchestrator.runPipeline(basePipelineInput);

        expect(result.totalLeadsDiscovered).toBe(1);
        
        const webSearchPrompt = mockedRunAgentWithLogging.mock.calls[2][2] as string;
        expect(webSearchPrompt).toContain('Use web_search to find "businesses in Amsterdam"');
      });

      it('should handle failures in broader query gracefully without breaking pipeline', async () => {
        // Call 1: Initial -> 0 leads
        mockedRunAgentWithLogging.mockResolvedValueOnce({ toolCalls: [] } as any);
        // Call 2: Broader -> Throws error
        mockedRunAgentWithLogging.mockRejectedValueOnce(new Error('Agent unavailable'));
        // Call 3: Web search -> 0 leads (to end pipeline quickly)
        mockedRunAgentWithLogging.mockResolvedValueOnce({ toolCalls: [] } as any);

        const result = await orchestrator.runPipeline(basePipelineInput);

        // Pipeline shouldn't fail completely, just log 0 leads
        expect(result.status).toBe('completed');
        expect(result.totalLeadsDiscovered).toBe(0);
        expect(result.errors).toEqual([]); // Fallback errors are console.warn, not pushed to main errors
      });

      it('should handle failures in web search fallback gracefully', async () => {
        // Call 1: Initial -> 0 leads
        mockedRunAgentWithLogging.mockResolvedValueOnce({ toolCalls: [] } as any);
        // Call 2: Broader -> 0 leads
        mockedRunAgentWithLogging.mockResolvedValueOnce({ toolCalls: [] } as any);
        // Call 3: Web search -> Throws error
        mockedRunAgentWithLogging.mockRejectedValueOnce(new Error('Network Error'));

        const result = await orchestrator.runPipeline(basePipelineInput);

        expect(result.status).toBe('completed');
        expect(result.totalLeadsDiscovered).toBe(0);
      });
    });

    describe('extractLeadIdsFromToolCalls', () => {
      it('should handle duplicate lead IDs by returning unique values', async () => {
        mockedRunAgentWithLogging.mockResolvedValueOnce({
          toolCalls: [
            { tool: 'save_lead', output: JSON.stringify({ id: 'lead-1' }) },
            { tool: 'save_lead', output: JSON.stringify({ id: 'lead-1' }) },
            { tool: 'save_lead', output: JSON.stringify({ id: 'lead-2' }) },
          ],
        } as any);

        mockedPrisma.lead.findMany.mockResolvedValue([] as any);

        const result = await orchestrator.runPipeline(basePipelineInput);

        expect(result.totalLeadsDiscovered).toBe(2);
        const fetchCall = mockedPrisma.lead.findMany.mock.calls[0][0] as any;
        expect(fetchCall.where.id.in).toEqual(['lead-1', 'lead-2']);
      });

      it('should ignore tool calls that are not save_lead', async () => {
        mockedRunAgentWithLogging.mockResolvedValueOnce({
          toolCalls: [
            { tool: 'search_web', output: JSON.stringify({ results: [] }) },
            { tool: 'save_lead', output: JSON.stringify({ id: 'lead-1' }) },
          ],
        } as any);

        const result = await orchestrator.runPipeline(basePipelineInput);
        expect(result.totalLeadsDiscovered).toBe(1);
      });

      it('should ignore save_lead outputs that are not valid JSON or missing id', async () => {
        mockedRunAgentWithLogging.mockResolvedValueOnce({
          toolCalls: [
            { tool: 'save_lead', output: 'not-json' },
            { tool: 'save_lead', output: JSON.stringify({ message: 'ok' }) },
            { tool: 'save_lead', output: JSON.stringify({ id: '' }) },
            { tool: 'save_lead', output: JSON.stringify({ id: 'valid-id' }) },
          ],
        } as any);

        mockedPrisma.lead.findMany.mockResolvedValue([] as any);

        const result = await orchestrator.runPipeline(basePipelineInput);
        expect(result.totalLeadsDiscovered).toBe(1);
      });
    });

    describe('Analysis Batching', () => {
      it('should process leads in batches according to analysisBatchSize', async () => {
        // Return 4 leads from research
        mockedRunAgentWithLogging.mockResolvedValueOnce({
          toolCalls: [
            { tool: 'save_lead', output: JSON.stringify({ id: 'lead-1' }) },
            { tool: 'save_lead', output: JSON.stringify({ id: 'lead-2' }) },
            { tool: 'save_lead', output: JSON.stringify({ id: 'lead-3' }) },
            { tool: 'save_lead', output: JSON.stringify({ id: 'lead-4' }) },
          ],
        } as any);

        mockedPrisma.lead.findMany.mockResolvedValueOnce([
          { id: 'lead-1', businessName: 'L1', website: 'w1', city: 'c', industry: 'i', email: 'e', phone: 'p', analyses: [] },
          { id: 'lead-2', businessName: 'L2', website: 'w2', city: 'c', industry: 'i', email: 'e', phone: 'p', analyses: [] },
          { id: 'lead-3', businessName: 'L3', website: 'w3', city: 'c', industry: 'i', email: 'e', phone: 'p', analyses: [] },
          { id: 'lead-4', businessName: 'L4', website: 'w4', city: 'c', industry: 'i', email: 'e', phone: 'p', analyses: [] },
        ] as any);

        mockedPrisma.lead.findMany.mockResolvedValueOnce([] as any); // outreach

        // Default batch size is 3, so it should iterate over 0..2 and 3..4
        const input = { ...basePipelineInput, analysisBatchSize: 3 };
        const result = await orchestrator.runPipeline(input);

        expect(result.totalLeadsAnalyzed).toBe(4);
        
        // 1 research call + 4 analysis calls
        expect(mockedRunAgentWithLogging).toHaveBeenCalledTimes(5);
      });

      it('should respect custom analysisBatchSize', async () => {
        mockedRunAgentWithLogging.mockResolvedValueOnce({
          toolCalls: [
            { tool: 'save_lead', output: JSON.stringify({ id: 'lead-1' }) },
            { tool: 'save_lead', output: JSON.stringify({ id: 'lead-2' }) },
          ],
        } as any);

        mockedPrisma.lead.findMany.mockResolvedValueOnce([
          { id: 'lead-1', businessName: 'L1', website: 'w1', city: 'c', industry: 'i', email: 'e', phone: 'p', analyses: [] },
          { id: 'lead-2', businessName: 'L2', website: 'w2', city: 'c', industry: 'i', email: 'e', phone: 'p', analyses: [] },
        ] as any);

        mockedPrisma.lead.findMany.mockResolvedValueOnce([] as any);

        const input = { ...basePipelineInput, analysisBatchSize: 1 };
        const result = await orchestrator.runPipeline(input);

        expect(result.totalLeadsAnalyzed).toBe(2);
        // Ensure sequential batches of 1 happened
        expect(mockedRunAgentWithLogging).toHaveBeenCalledTimes(3); // 1 research + 2 analysis
      });
    });

    describe('buildBroaderQuery', () => {
      it('should remove Dutch city/location patterns correctly', async () => {
        mockedRunAgentWithLogging.mockResolvedValueOnce({ toolCalls: [] } as any); // initial
        mockedRunAgentWithLogging.mockResolvedValueOnce({ toolCalls: [] } as any); // broader
        mockedRunAgentWithLogging.mockResolvedValueOnce({ toolCalls: [] } as any); // web search

        await orchestrator.runPipeline({ pipelineRunId: 'p1', query: 'Find plumbers te Amsterdam' });
        expect((mockedRunAgentWithLogging.mock.calls[1][2] as string).trim()).toBe('Find plumbers');

        vi.clearAllMocks();
        mockedPrisma.agentPipelineRun.update.mockResolvedValue({} as any);
        mockedLoadAgentConfig.mockResolvedValue({} as any);
        
        mockedRunAgentWithLogging.mockResolvedValueOnce({ toolCalls: [] } as any);
        mockedRunAgentWithLogging.mockResolvedValueOnce({ toolCalls: [] } as any);

        await orchestrator.runPipeline({ pipelineRunId: 'p1', query: 'Find electricians in de buurt van Haarlem' });
        expect((mockedRunAgentWithLogging.mock.calls[1][2] as string).trim()).toBe('Find electricians');
      });
    });
  });
});