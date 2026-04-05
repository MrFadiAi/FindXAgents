import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadAgentConfig, loadAllActiveAgents } from './agent-registry.js';
import { prisma } from '../../lib/db/client.js';
import { getTools } from './tool-registry.js';
import { buildSystemPrompt } from './prompt-builder.js';

// Mock dependencies
vi.mock('../../lib/db/client.js', () => ({
  prisma: {
    agent: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('./tool-registry.js', () => ({
  getTools: vi.fn(),
}));

vi.mock('./prompt-builder.js', () => ({
  buildSystemPrompt: vi.fn(),
}));

const mockAgentDbRecord = {
  id: 'agent-123',
  name: 'TestAgent',
  isActive: true,
  toolNames: ['search_tool', 'email_tool'],
  maxIterations: 5,
  maxTokens: 1000,
  pipelineOrder: 1,
  skills: [{ id: 'skill-1', sortOrder: 1 }],
};

const mockToolsArray = [{ name: 'search_tool' }, { name: 'email_tool' }];
const mockSystemPrompt = 'You are a helpful test assistant.';

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(getTools).mockReturnValue(mockToolsArray);
  vi.mocked(buildSystemPrompt).mockReturnValue(mockSystemPrompt);
});

describe('loadAgentConfig', () => {
  it('should load and return the agent configuration successfully', async () => {
    vi.mocked(prisma.agent.findUnique).mockResolvedValue(mockAgentDbRecord as any);

    const result = await loadAgentConfig('TestAgent');

    expect(prisma.agent.findUnique).toHaveBeenCalledWith({
      where: { name: 'TestAgent' },
      include: {
        skills: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    
    expect(getTools).toHaveBeenCalledWith(['search_tool', 'email_tool']);
    expect(buildSystemPrompt).toHaveBeenCalledWith(mockAgentDbRecord);
    
    expect(result).toEqual({
      id: 'agent-123',
      name: 'TestAgent',
      systemPrompt: mockSystemPrompt,
      tools: mockToolsArray,
      maxIterations: 5,
      maxTokens: 1000,
    });
  });

  it('should throw an error if the agent is not found in the database', async () => {
    vi.mocked(prisma.agent.findUnique).mockResolvedValue(null);

    await expect(loadAgentConfig('UnknownAgent')).rejects.toThrow(
      'Agent "UnknownAgent" not found or inactive'
    );

    expect(getTools).not.toHaveBeenCalled();
    expect(buildSystemPrompt).not.toHaveBeenCalled();
  });

  it('should throw an error if the agent exists but is inactive', async () => {
    const inactiveAgent = { ...mockAgentDbRecord, isActive: false };
    vi.mocked(prisma.agent.findUnique).mockResolvedValue(inactiveAgent as any);

    await expect(loadAgentConfig('InactiveAgent')).rejects.toThrow(
      'Agent "InactiveAgent" not found or inactive'
    );

    expect(getTools).not.toHaveBeenCalled();
  });

  it('should default to an empty array of tools if toolNames is null', async () => {
    const agentNullTools = { ...mockAgentDbRecord, toolNames: null };
    vi.mocked(prisma.agent.findUnique).mockResolvedValue(agentNullTools as any);

    const result = await loadAgentConfig('NullToolsAgent');

    expect(getTools).toHaveBeenCalledWith([]);
    expect(result.tools).toEqual(mockToolsArray);
  });

  it('should handle unexpected database errors gracefully', async () => {
    const dbError = new Error('Connection refused');
    vi.mocked(prisma.agent.findUnique).mockRejectedValue(dbError);

    await expect(loadAgentConfig('BrokenAgent')).rejects.toThrow('Connection refused');
  });
});

describe('loadAllActiveAgents', () => {
  it('should load and map all active agents successfully', async () => {
    const mockAgents = [
      mockAgentDbRecord,
      { ...mockAgentDbRecord, id: 'agent-456', name: 'SecondAgent', pipelineOrder: 2 },
    ];
    vi.mocked(prisma.agent.findMany).mockResolvedValue(mockAgents as any);

    const results = await loadAllActiveAgents();

    expect(prisma.agent.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { pipelineOrder: 'asc' },
      include: {
        skills: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: 'agent-123',
      name: 'TestAgent',
      systemPrompt: mockSystemPrompt,
      tools: mockToolsArray,
      maxIterations: 5,
      maxTokens: 1000,
    });
    expect(results[1].id).toBe('agent-456');
  });

  it('should return an empty array when no active agents exist', async () => {
    vi.mocked(prisma.agent.findMany).mockResolvedValue([]);

    const results = await loadAllActiveAgents();

    expect(results).toEqual([]);
    expect(getTools).not.toHaveBeenCalled();
    expect(buildSystemPrompt).not.toHaveBeenCalled();
  });

  it('should default to an empty array of tools if an agent has null toolNames', async () => {
    const agentNullTools = { ...mockAgentDbRecord, toolNames: undefined };
    vi.mocked(prisma.agent.findMany).mockResolvedValue([agentNullTools] as any);

    const results = await loadAllActiveAgents();

    expect(results).toHaveLength(1);
    expect(getTools).toHaveBeenCalledWith([]);
  });

  it('should handle unexpected database errors gracefully', async () => {
    const dbError = new Error('Timeout');
    vi.mocked(prisma.agent.findMany).mockRejectedValue(dbError);

    await expect(loadAllActiveAgents()).rejects.toThrow('Timeout');
  });
});