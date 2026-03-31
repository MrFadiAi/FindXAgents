import { prisma } from "../../lib/db/client.js";
import { getTools } from "./tool-registry.js";
import { buildSystemPrompt } from "./prompt-builder.js";
import type { AgentConfig } from "./types.js";

export async function loadAgentConfig(agentName: string): Promise<AgentConfig & { id: string }> {
  const agent = await prisma.agent.findUnique({
    where: { name: agentName },
    include: {
      skills: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!agent || !agent.isActive) {
    throw new Error(`Agent "${agentName}" not found or inactive`);
  }

  const toolNames = (agent.toolNames as string[]) ?? [];
  const tools = getTools(toolNames);

  // Rebuild system prompt if identity/soul/tools changed
  const systemPrompt = buildSystemPrompt(agent);

  return {
    id: agent.id,
    name: agent.name,
    systemPrompt,
    tools,
    maxIterations: agent.maxIterations,
    maxTokens: agent.maxTokens,
  };
}

export async function loadAllActiveAgents(): Promise<Array<AgentConfig & { id: string }>> {
  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    orderBy: { pipelineOrder: "asc" },
    include: {
      skills: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return agents.map((agent) => {
    const toolNames = (agent.toolNames as string[]) ?? [];
    const tools = getTools(toolNames);
    const systemPrompt = buildSystemPrompt(agent);

    return {
      id: agent.id,
      name: agent.name,
      systemPrompt,
      tools,
      maxIterations: agent.maxIterations,
      maxTokens: agent.maxTokens,
    };
  });
}
