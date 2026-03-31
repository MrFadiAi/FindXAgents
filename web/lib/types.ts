export type LeadStatus =
  | "discovered"
  | "analyzing"
  | "analyzed"
  | "contacting"
  | "responded"
  | "qualified"
  | "won"
  | "lost";

export type OutreachStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "sent"
  | "saved"
  | "opened"
  | "replied"
  | "bounced"
  | "failed";

export interface Lead {
  id: string;
  businessName: string;
  kvkNumber: string | null;
  address: string | null;
  city: string;
  industry: string | null;
  website: string | null;
  hasWebsite: boolean;
  phone: string | null;
  email: string | null;
  source: string;
  sourceId: string | null;
  status: LeadStatus;
  leadScore: number | null;
  pipelineStageId: string | null;
  discoveredAt: string;
  createdAt: string;
  updatedAt: string;
  analyses?: Analysis[];
  outreaches?: Outreach[];
  pipelineStage?: PipelineStage | null;
  _count?: { analyses: number; outreaches: number };
}

export interface Analysis {
  id: string;
  leadId: string;
  type: string;
  score: number | null;
  findings: Record<string, unknown>;
  opportunities: Record<string, unknown> | null;
  socialPresence: Record<string, unknown> | null;
  competitors: Record<string, unknown> | null;
  serviceGaps: Record<string, unknown> | null;
  revenueImpact: Record<string, unknown> | null;
  analyzedAt: string;
  createdAt: string;
}

export interface Outreach {
  id: string;
  leadId: string;
  status: OutreachStatus;
  subject: string;
  body: string;
  personalizedDetails: Record<string, unknown>;
  sentAt: string | null;
  openedAt: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  order: number;
  leads?: Lead[];
  _count?: { leads: number };
}

export interface DashboardStats {
  totalLeads: number;
  leadsAnalyzed: number;
  leadsContacted: number;
  leadsResponded: number;
  leadsWon: number;
  leadsThisWeek: number;
  conversionRate: string;
}

export interface PaginatedLeads {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
}

export const PIPELINE_STAGES: { key: LeadStatus; label: string; color: string }[] = [
  { key: "discovered", label: "New", color: "bg-slate-500" },
  { key: "analyzing", label: "Analyzing", color: "bg-yellow-500" },
  { key: "analyzed", label: "Analyzed", color: "bg-indigo-500" },
  { key: "contacting", label: "Contacting", color: "bg-blue-500" },
  { key: "responded", label: "Responded", color: "bg-amber-500" },
  { key: "qualified", label: "Qualified", color: "bg-purple-500" },
  { key: "won", label: "Won", color: "bg-emerald-500" },
  { key: "lost", label: "Lost", color: "bg-red-500" },
];

export const STATUS_COLORS: Record<LeadStatus, string> = {
  discovered: "bg-slate-100 text-slate-700",
  analyzing: "bg-yellow-100 text-yellow-700",
  analyzed: "bg-indigo-100 text-indigo-700",
  contacting: "bg-blue-100 text-blue-700",
  responded: "bg-amber-100 text-amber-700",
  qualified: "bg-purple-100 text-purple-700",
  won: "bg-emerald-100 text-emerald-700",
  lost: "bg-red-100 text-red-700",
};

export const STATUS_LABELS: Record<LeadStatus, string> = {
  discovered: "New",
  analyzing: "Analyzing",
  analyzed: "Analyzed",
  contacting: "Contacted",
  responded: "Responded",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

// Agent Pipeline types
export type AgentRunStatus = "running" | "completed" | "partial" | "failed" | "queued" | "cancelled";

export interface AgentPipelineRun {
  id: string;
  query: string;
  status: AgentRunStatus;
  leadsFound: number;
  leadsAnalyzed: number;
  emailsDrafted: number;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  leads?: Lead[];
}

export interface AgentRunEmail {
  id: string;
  leadId: string;
  status: OutreachStatus;
  subject: string;
  body: string;
  sentAt: string | null;
  openedAt: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lead: {
    id: string;
    businessName: string;
    city: string;
    website: string | null;
    industry: string | null;
  };
}

// --- Agent Detail types (for the agents management UI) ---

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  toolNames: string[];
  promptAdd: string;
  isActive: boolean;
  sortOrder: number;
}

export interface Agent {
  id: string;
  name: string;
  displayName: string;
  description: string;
  role: string;
  icon: string;
  model: string;
  maxIterations: number;
  maxTokens: number;
  temperature: number | null;
  identityMd: string;
  soulMd: string;
  toolsMd: string;
  systemPrompt: string;
  toolNames: string[];
  pipelineOrder: number;
  isActive: boolean;
  skills: AgentSkill[];
  _count?: { skills: number; logs: number };
  createdAt: string;
  updatedAt: string;
}

export interface AgentLog {
  id: string;
  agentId: string;
  pipelineRunId: string;
  phase: string;
  level: string;
  message: string;
  toolName: string | null;
  toolInput: Record<string, unknown> | null;
  toolOutput: string | null;
  duration: number | null;
  tokens: number | null;
  createdAt: string;
  agent?: {
    id: string;
    name: string;
    displayName: string;
  };
}

export const AGENT_PIPELINE_STAGES = PIPELINE_STAGES;
