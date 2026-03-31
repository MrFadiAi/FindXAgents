import type {
  PaginatedLeads,
  Lead,
  Analysis,
  Outreach,
  PipelineStage,
  DashboardStats,
  LeadStatus,
  AgentPipelineRun,
  AgentRunEmail,
  Agent,
  AgentLog,
} from "./types";

const BASE = "/api";

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...init?.headers } as Record<string, string>;
  if (init?.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

// --- Dashboard ---

export function getDashboardStats(): Promise<{ stats: DashboardStats }> {
  return fetchApi("/dashboard/stats");
}

// --- Pipeline ---

export function getPipeline(): Promise<{
  stages: PipelineStage[];
  statusCounts: { status: LeadStatus; _count: number }[];
}> {
  return fetchApi("/pipeline");
}

// --- Leads ---

export interface LeadListParams {
  page?: number;
  pageSize?: number;
  city?: string;
  industry?: string;
  status?: string;
  source?: string;
  hasWebsite?: boolean;
  search?: string;
}

export function getLeads(params?: LeadListParams): Promise<PaginatedLeads> {
  const sp = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") sp.set(k, String(v));
    }
  }
  return fetchApi(`/leads?${sp.toString()}`);
}

export function getLead(id: string): Promise<{ lead: Lead | null }> {
  return fetchApi(`/leads/${id}`);
}

export function updateLead(
  id: string,
  data: Partial<Pick<Lead, "status" | "businessName" | "industry" | "website" | "phone" | "email">>,
): Promise<{ lead: Lead }> {
  return fetchApi(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

// --- Discovery ---

export interface DiscoverParams {
  city?: string;
  industry?: string;
  sbiCode?: string;
  limit?: number;
  sources?: ("kvk" | "google")[];
  sync?: boolean;
}

export function triggerDiscovery(params: DiscoverParams): Promise<unknown> {
  return fetchApi(`/leads/discover`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// --- Analysis ---

export function triggerAnalysis(
  leadId: string,
  sync = false,
): Promise<{ analysis?: Analysis; message?: string; jobId?: string }> {
  return fetchApi(`/leads/${leadId}/analyze`, {
    method: "POST",
    body: JSON.stringify({ sync }),
  });
}

export function getAnalyses(leadId: string): Promise<{ analyses: Analysis[] }> {
  return fetchApi(`/leads/${leadId}/analyses`);
}

// --- Outreach ---

export function generateOutreach(
  leadId: string,
  opts?: { analysisId?: string; tone?: string; language?: string; sync?: boolean },
): Promise<unknown> {
  return fetchApi(`/leads/${leadId}/outreach/generate`, {
    method: "POST",
    body: JSON.stringify(opts ?? { sync: true }),
  });
}

export function sendOutreach(
  leadId: string,
  outreachId: string,
  sync = false,
): Promise<unknown> {
  return fetchApi(`/leads/${leadId}/outreach/send`, {
    method: "POST",
    body: JSON.stringify({ outreachId, sync }),
  });
}

export function updateOutreach(
  outreachId: string,
  data: { subject?: string; body?: string; status?: string },
): Promise<{ outreach: Outreach }> {
  return fetchApi(`/outreaches/${outreachId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function getOutreaches(leadId: string): Promise<{ outreaches: Outreach[] }> {
  return fetchApi(`/leads/${leadId}/outreaches`);
}

// --- Agent Pipeline ---

export function triggerAgentRun(
  query: string,
  sync = false,
  maxResults?: number,
  language?: "en" | "nl" | "ar",
): Promise<{ runId: string; status: string } | AgentPipelineRun> {
  return fetchApi("/agents/run", {
    method: "POST",
    body: JSON.stringify({ query, sync, maxResults, language }),
  });
}

export function cancelAgentRun(runId: string): Promise<{ run: AgentPipelineRun }> {
  return fetchApi(`/agents/runs/${runId}/cancel`, { method: "POST" });
}

export function getAgentRuns(): Promise<{ runs: AgentPipelineRun[] }> {
  return fetchApi("/agents/runs");
}

export function getAgentRun(
  id: string,
): Promise<{ run: (AgentPipelineRun & { leads?: Lead[] }) | null }> {
  return fetchApi(`/agents/runs/${id}`);
}

export function getAgentRunEmails(
  id: string,
): Promise<{ emails: AgentRunEmail[] }> {
  return fetchApi(`/agents/runs/${id}/emails`);
}

// --- Agent Management (detail pages) ---

export function getAgents(): Promise<{ agents: Agent[] }> {
  return fetchApi("/agents");
}

export function getAgent(
  name: string,
): Promise<{ agent: Agent | null }> {
  return fetchApi(`/agents/name/${name}`);
}

export function updateAgent(
  name: string,
  data: Partial<Pick<Agent, "displayName" | "description" | "isActive" | "model" | "maxIterations" | "maxTokens" | "temperature" | "identityMd" | "soulMd" | "toolsMd" | "toolNames">>,
): Promise<{ agent: Agent }> {
  return fetchApi(`/agents/name/${name}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function getAgentTools(): Promise<{ tools: Array<{ name: string; description: string }> }> {
  return fetchApi("/agents/tools");
}

export function seedAgents(): Promise<{ seeded: boolean; agents: number }> {
  return fetchApi("/agents/seed", { method: "POST" });
}

export function getRunLogs(
  runId: string,
): Promise<{ logs: AgentLog[] }> {
  return fetchApi(`/agents/runs/${runId}/logs`);
}

export function getAgentLogs(
  params?: { agentId?: string; pipelineRunId?: string; pageSize?: number },
): Promise<{ logs: AgentLog[]; total: number; page: number; pageSize: number }> {
  const sp = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") sp.set(k, String(v));
    }
  }
  return fetchApi(`/agents/logs?${sp.toString()}`);
}

// --- Score Distribution ---

export function getScoreDistribution(): Promise<{
  buckets: { cold: number; warm: number; hot: number; unscored: number };
  avgScore: number;
  totalScored: number;
}> {
  return fetchApi("/leads/score-distribution");
}

// --- CSV Import/Export ---

export function importLeads(csv: string, skipDuplicates = true): Promise<{
  created: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}> {
  return fetchApi("/leads/import", {
    method: "POST",
    body: JSON.stringify({ csv, skipDuplicates }),
  });
}

export function exportLeadsUrl(filters?: Record<string, string>): string {
  const sp = new URLSearchParams();
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v) sp.set(k, v);
    }
  }
  return `${BASE}/leads/export?${sp.toString()}`;
}

export function exportOutreachesUrl(status?: string): string {
  const sp = new URLSearchParams();
  if (status) sp.set("status", status);
  return `${BASE}/outreaches/export?${sp.toString()}`;
}

// --- Data Management ---

export function clearAllData(): Promise<{
  deleted: {
    leads: number;
    analyses: number;
    outreaches: number;
    agentLogs: number;
    pipelineRuns: number;
  };
}> {
  return fetchApi("/data/clear-all", { method: "DELETE" });
}
