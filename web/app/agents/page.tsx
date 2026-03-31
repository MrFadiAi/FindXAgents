"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Bot,
  Search,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Mail,
  ExternalLink,
  Send,
  Cpu,
  Wrench,
  Zap,
  Eye,
  XCircle,
  ChevronRight,
  Sparkles,
  Play,
  ArrowDown,
  Users,
  BarChart3,
  Clock,
} from "lucide-react";
import { triggerAgentRun, getAgentRuns, getAgentRunEmails, getAgents, cancelAgentRun } from "../../lib/api";
import type { AgentPipelineRun, AgentRunEmail, AgentRunStatus, Agent } from "../../lib/types";
import { AgentMonitor } from "../../components/agent-monitor";

const STATUS_STYLES: Record<
  AgentRunStatus,
  { bg: string; text: string; ring: string; label: string; dot: string }
> = {
  running: { bg: "bg-yellow-900/30", text: "text-yellow-400", ring: "ring-yellow-700", label: "Running...", dot: "bg-yellow-500" },
  completed: { bg: "bg-emerald-900/30", text: "text-emerald-400", ring: "ring-emerald-700", label: "Completed", dot: "bg-emerald-500" },
  partial: { bg: "bg-amber-900/30", text: "text-amber-400", ring: "ring-amber-700", label: "Partial", dot: "bg-amber-500" },
  failed: { bg: "bg-red-900/30", text: "text-red-400", ring: "ring-red-700", label: "Failed", dot: "bg-red-500" },
  queued: { bg: "bg-slate-800", text: "text-slate-400", ring: "ring-slate-600", label: "Queued", dot: "bg-slate-500" },
  cancelled: { bg: "bg-slate-700", text: "text-slate-500", ring: "ring-slate-600", label: "Cancelled", dot: "bg-slate-400" },
};

const ROLE_ICONS: Record<string, React.ElementType> = { research: Search, analysis: Eye, outreach: Mail };
const ROLE_COLORS: Record<string, { bg: string; text: string; border: string; gradient: string }> = {
  research: { bg: "bg-emerald-900/30", text: "text-emerald-400", border: "border-l-emerald-400", gradient: "from-emerald-500 to-teal-600" },
  analysis: { bg: "bg-indigo-900/30", text: "text-indigo-400", border: "border-l-indigo-400", gradient: "from-indigo-500 to-purple-600" },
  outreach: { bg: "bg-amber-900/30", text: "text-amber-400", border: "border-l-amber-400", gradient: "from-amber-500 to-orange-600" },
};

const AGENT_STEPS = [
  { key: "research", label: "Research", description: "Finding businesses", icon: Search, color: "from-emerald-500 to-teal-600" },
  { key: "analysis", label: "Analysis", description: "Scoring & reviewing", icon: Eye, color: "from-indigo-500 to-purple-600" },
  { key: "outreach", label: "Outreach", description: "Drafting emails", icon: Mail, color: "from-amber-500 to-orange-600" },
];

type Tab = "pipeline" | "agents";

export default function AgentsPage() {
  const [tab, setTab] = useState<Tab>("pipeline");
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState<string>("");
  const [language, setLanguage] = useState<"nl" | "en">("nl");
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<AgentPipelineRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [emails, setEmails] = useState<AgentRunEmail[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [activeStep, setActiveStep] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const loadRuns = useCallback(async () => {
    try {
      const result = await getAgentRuns();
      setRuns(result.runs);
    } catch { /* ignore */ }
  }, []);

  const loadAgents = useCallback(async () => {
    try {
      const result = await getAgents();
      setAgents(result.agents);
    } catch {
      setAgents([]);
    } finally {
      setLoadingAgents(false);
    }
  }, []);

  useEffect(() => {
    loadRuns().then(() => setInitialLoad(false));
    loadAgents();
  }, [loadRuns, loadAgents]);

  // Auto-select the most recent run on initial load
  useEffect(() => {
    if (initialLoad || runs.length === 0 || selectedRunId) return;
    setSelectedRunId(runs[0].id);
  }, [runs, initialLoad, selectedRunId]);

  // Auto-refresh runs while a pipeline is running
  useEffect(() => {
    if (!running || !selectedRunId) return;
    const interval = setInterval(async () => {
      await loadRuns();
      if (selectedRunId) {
        try {
          const result = await getAgentRunEmails(selectedRunId);
          setEmails(result.emails);
        } catch { /* ignore */ }
      }
    }, 3000);
    pollRef.current = interval;
    return () => {
      clearInterval(interval);
      pollRef.current = null;
    };
  }, [running, selectedRunId, loadRuns]);

  // Cycle through steps for the animation
  useEffect(() => {
    if (!running) { setActiveStep(0); return; }
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 3);
    }, 3000);
    return () => clearInterval(interval);
  }, [running]);

  // Load emails when selecting a completed run
  useEffect(() => {
    if (!selectedRunId || running) { setEmails([]); return; }
    let cancelled = false;
    setLoadingEmails(true);
    getAgentRunEmails(selectedRunId)
      .then((result) => { if (!cancelled) setEmails(result.emails); })
      .catch(() => { if (!cancelled) setEmails([]); })
      .finally(() => { if (!cancelled) setLoadingEmails(false); });
    return () => { cancelled = true; };
  }, [selectedRunId, running]);

  // Check if the current run has completed
  useEffect(() => {
    if (!running || !selectedRunId) return;
    const currentRun = runs.find((r) => r.id === selectedRunId);
    if (currentRun && (currentRun.status === "completed" || currentRun.status === "failed" || currentRun.status === "partial" || currentRun.status === "cancelled")) {
      setRunning(false);
      // Final email load
      getAgentRunEmails(selectedRunId).then((result) => setEmails(result.emails)).catch(() => {});
      // Auto-scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 500);
    }
  }, [runs, running, selectedRunId]);

  async function handleRun() {
    if (!query.trim()) return;
    setRunning(true);
    setError(null);
    setActiveStep(0);
    setEmails([]);
    const limit = maxResults ? parseInt(maxResults, 10) : undefined;
    try {
      const result = await triggerAgentRun(
        query.trim(),
        false,
        limit && limit > 0 ? limit : undefined,
        language,
      );
      const runId = (result as { runId?: string }).runId ?? (result as AgentPipelineRun)?.id;
      if (runId) {
        setSelectedRunId(runId);
      }
      setQuery("");
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pipeline failed");
      setRunning(false);
    }
  }

  async function handleCancel() {
    if (!selectedRunId) return;
    try { await cancelAgentRun(selectedRunId); } catch { /* ignore */ }
    setRunning(false);
    loadRuns();
  }

  async function handleCancelRun(runId: string) {
    try { await cancelAgentRun(runId); } catch { /* ignore */ }
    if (runId === selectedRunId) setRunning(false);
    loadRuns();
  }

  const selectedRun = runs.find((r) => r.id === selectedRunId);
  const sortedAgents = [...agents].sort((a, b) => a.pipelineOrder - b.pipelineOrder);

  const isCompleted = selectedRun?.status === "completed" || selectedRun?.status === "partial";

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Agent Pipeline</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Run your AI prospecting pipeline or manage individual agents
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center bg-slate-800 rounded-lg p-1 w-fit">
        {(["pipeline", "agents"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-150 ${
              tab === t ? "bg-slate-700 text-slate-100 shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t === "pipeline" ? <Sparkles className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
            {t === "pipeline" ? "Pipeline" : "Agents"}
          </button>
        ))}
      </div>

      {/* ===================== PIPELINE TAB ===================== */}
      {tab === "pipeline" && (
        <div className="space-y-6">
          {/* Search Box */}
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRun(); }}
                  placeholder="e.g. restaurants in Amsterdam, dentistry in Rotterdam"
                  className="w-full pl-10 pr-3 py-2.5 border border-slate-700 rounded-xl text-sm bg-slate-800 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="relative w-28">
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={maxResults}
                  onChange={(e) => setMaxResults(e.target.value)}
                  placeholder="No limit"
                  className="w-full px-3 py-2.5 border border-slate-700 rounded-xl text-sm bg-slate-800 text-slate-200 text-center placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="absolute -top-2 left-2 px-1 text-[10px] text-slate-500 bg-slate-900 font-medium">Max results</span>
              </div>
              <div className="relative w-28">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "nl" | "en")}
                  className="w-full px-3 py-2.5 border border-slate-700 rounded-xl text-sm bg-slate-800 text-slate-200 text-center appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="nl">Nederlands</option>
                  <option value="en">English</option>
                </select>
                <span className="absolute -top-2 left-2 px-1 text-[10px] text-slate-500 bg-slate-900 font-medium">Language</span>
              </div>
              {!running ? (
                <button
                  onClick={handleRun}
                  disabled={!query.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 shadow-sm shadow-blue-500/20"
                >
                  <Play className="w-4 h-4" />
                  Run Pipeline
                </button>
              ) : (
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Cancel
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Describe the businesses you want to find. The pipeline will research, analyze, and generate outreach emails.
            </p>
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-900/30 text-red-400 rounded-lg text-sm mt-4">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* Pipeline Step Animation */}
          <div className="flex items-center gap-2">
            {AGENT_STEPS.map((step, i) => {
              const StepIcon = step.icon;
              const isActive = running && activeStep === i;
              const isDone = running && activeStep > i;
              return (
                <div key={step.key} className="flex items-center">
                  <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-all duration-500 ${
                    isActive
                      ? "bg-slate-900 border-blue-500 shadow-lg shadow-blue-500/10 scale-105"
                      : running
                        ? "bg-slate-900 border-slate-700 shadow-sm"
                        : "bg-slate-900 border-slate-700 shadow-sm"
                  }`}>
                    <div className={`relative w-8 h-8 rounded-lg bg-gradient-to-br ${step.color} flex items-center justify-center transition-all duration-300 ${
                      isActive ? "shadow-md scale-110" : ""
                    }`}>
                      <StepIcon className="w-4 h-4 text-white" />
                      {isActive && (
                        <div className="absolute inset-0 rounded-lg bg-white/30 animate-ping" />
                      )}
                    </div>
                    <div>
                      <span className={`text-xs font-semibold block leading-tight transition-colors duration-300 ${
                        isActive ? "text-blue-400" : "text-slate-200"
                      }`}>
                        {step.label}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {isActive ? step.description : `Step ${i + 1}`}
                      </span>
                    </div>
                    {isActive && (
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin ml-1" />
                    )}
                    {isDone && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-1" />
                    )}
                  </div>
                  {i < AGENT_STEPS.length - 1 && (
                    <ChevronRight className={`w-4 h-4 mx-1 transition-colors duration-300 ${
                      running && activeStep > i ? "text-emerald-400" : "text-slate-600"
                    }`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Completion Summary — shown when a run just completed */}
          {isCompleted && selectedRun && !running && (
            <div ref={resultsRef} className="bg-gradient-to-r from-emerald-900/20 via-slate-900 to-blue-900/20 rounded-2xl border border-emerald-700/40 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Pipeline Complete</h3>
                  <p className="text-xs text-slate-400">{selectedRun.query}</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Search className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Found</span>
                  </div>
                  <p className="text-xl font-bold text-slate-100">{selectedRun.leadsFound}</p>
                  <p className="text-[10px] text-slate-500">businesses</p>
                </div>
                <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
                  <div className="flex items-center gap-1.5 mb-1">
                    <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Analyzed</span>
                  </div>
                  <p className="text-xl font-bold text-slate-100">{selectedRun.leadsAnalyzed}</p>
                  <p className="text-[10px] text-slate-500">websites</p>
                </div>
                <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Mail className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Emails</span>
                  </div>
                  <p className="text-xl font-bold text-slate-100">{selectedRun.emailsDrafted}</p>
                  <p className="text-[10px] text-slate-500">drafted</p>
                </div>
                <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Users className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Agents</span>
                  </div>
                  <p className="text-xl font-bold text-slate-100">3/3</p>
                  <p className="text-[10px] text-slate-500">completed</p>
                </div>
              </div>
              {emails.length > 0 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-blue-400">
                  <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
                  <span className="font-medium">Scroll down to see {emails.length} email draft{emails.length > 1 ? "s" : ""} and monitor</span>
                </div>
              )}
            </div>
          )}

          {/* Failed banner */}
          {selectedRun?.status === "failed" && !running && (
            <div ref={resultsRef} className="bg-red-900/20 rounded-2xl border border-red-700/40 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-900/50 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-red-300">Pipeline Failed</h3>
                  <p className="text-xs text-red-400">{selectedRun.error || "Unknown error occurred"}</p>
                </div>
              </div>
            </div>
          )}

          {/* Live Monitor — show when a run is selected */}
          {selectedRunId && (
            <div className="space-y-1">
              {running && (
                <div className="flex items-center gap-2 text-xs text-blue-400 font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Pipeline running — agents are working in real-time
                </div>
              )}
              <AgentMonitor pipelineRunId={selectedRunId} status={selectedRun?.status} />
            </div>
          )}

          {/* Email Drafts — shown ABOVE run history for visibility */}
          {selectedRunId && !running && (
            <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Email Drafts
                  {emails.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400">{emails.length}</span>
                  )}
                </h2>
                {selectedRun && <span className="text-xs text-slate-500 max-w-[200px] truncate">{selectedRun.query}</span>}
              </div>
              {loadingEmails ? (
                <div className="px-6 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto" /></div>
              ) : emails.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Mail className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">No email drafts for this run</p>
                  <p className="text-xs text-slate-500 mt-1">The outreach agent will create drafts when leads have valid email addresses</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-700">
                  {emails.map((email) => (
                    <div key={email.id} className="px-6 py-4 flex items-start gap-4 hover:bg-slate-800/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-slate-200">{email.lead.businessName}</span>
                          {email.lead.industry && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{email.lead.industry}</span>}
                          {email.lead.website && (
                            <a href={email.lead.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline inline-flex items-center gap-0.5"><ExternalLink className="w-3 h-3" /></a>
                          )}
                        </div>
                        <p className="text-xs font-medium text-slate-300 mb-0.5">{email.subject}</p>
                        <p className="text-xs text-slate-400 line-clamp-3">{email.body}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${
                          email.status === "sent" ? "bg-emerald-900/30 text-emerald-400 ring-emerald-700"
                            : email.status === "opened" ? "bg-blue-900/30 text-blue-400 ring-blue-700"
                            : email.status === "draft" ? "bg-amber-900/30 text-amber-400 ring-amber-700"
                            : "bg-slate-800 text-slate-400 ring-slate-600"
                        }`}>
                          {email.status === "sent" && <Send className="w-2.5 h-2.5" />}
                          {email.status === "opened" && <Mail className="w-2.5 h-2.5" />}
                          {email.status === "draft" && <Sparkles className="w-2.5 h-2.5" />}
                          {email.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Run History */}
          <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Pipeline Runs</h2>
              {runs.length > 0 && <span className="text-xs text-slate-500">{runs.length} runs</span>}
            </div>

            {runs.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4">
                  <Bot className="w-6 h-6 text-slate-500" />
                </div>
                <p className="text-sm font-medium text-slate-400">No runs yet</p>
                <p className="text-xs text-slate-500 mt-1">Enter a search query above to start your first pipeline run</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-700">
                {runs.map((run) => {
                  const style = STATUS_STYLES[run.status as AgentRunStatus] ?? STATUS_STYLES.queued;
                  const isSelected = run.id === selectedRunId;
                  return (
                    <li
                      key={run.id}
                      onClick={() => { if (!running) setSelectedRunId(isSelected ? null : run.id); }}
                      className={`px-6 py-4 cursor-pointer hover:bg-slate-800/50 transition-all duration-150 border-l-[3px] ${
                        isSelected ? "border-l-blue-500 bg-blue-900/20" : "border-l-transparent"
                      } ${running && run.status === "running" ? "border-l-yellow-400 bg-yellow-900/10" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-200 truncate">{run.query}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-slate-500">{new Date(run.createdAt).toLocaleString()}</span>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${style.bg} ${style.text} ${style.ring}`}>
                            {run.status === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
                            {run.status === "completed" && <CheckCircle2 className="w-3 h-3" />}
                            {run.status === "failed" && <AlertTriangle className="w-3 h-3" />}
                            {style.label}
                          </span>
                          {run.status === "running" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCancelRun(run.id); }}
                              className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-red-400 bg-red-900/30 hover:bg-red-900/50 rounded-lg border border-red-700 transition-colors"
                            >
                              <XCircle className="w-3 h-3" />
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{run.leadsFound} found</span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-900/30 text-indigo-400">{run.leadsAnalyzed} analyzed</span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-400">{run.emailsDrafted} emails</span>
                        {run.error && <span className="text-[11px] text-red-400 truncate ml-2">{run.error}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Recent Runs — compact summary of last 5 runs */}
          {runs.length > 0 && (
            <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-500" />
                  Recent Runs
                </h2>
                <span className="text-xs text-slate-500">Last {Math.min(runs.length, 5)} runs</span>
              </div>
              <div className="divide-y divide-slate-700">
                {runs.slice(0, 5).map((run) => {
                  const style = STATUS_STYLES[run.status as AgentRunStatus] ?? STATUS_STYLES.queued;
                  return (
                    <div key={run.id} className="px-6 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                        <span className="text-xs font-medium text-slate-300 truncate">{run.query}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <span className="text-[10px] text-slate-500">{run.leadsFound} found</span>
                        <span className="text-[10px] text-slate-500">{run.leadsAnalyzed} analyzed</span>
                        <span className="text-[10px] text-slate-500">{run.emailsDrafted} emails</span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ring-1 ring-inset ${style.bg} ${style.text} ${style.ring}`}>
                          {style.label}
                        </span>
                        <span className="text-[10px] text-slate-500">{new Date(run.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== AGENTS TAB ===================== */}
      {tab === "agents" && (
        <div className="space-y-6">
          {loadingAgents ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
              <span className="ml-2 text-sm text-slate-400">Loading agents...</span>
            </div>
          ) : agents.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl border border-slate-700 px-6 py-16 text-center shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4">
                <Bot className="w-6 h-6 text-slate-500" />
              </div>
              <p className="text-sm font-medium text-slate-400">No agents configured</p>
              <p className="text-xs text-slate-500 mt-1">Seed the Agent table to get started.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {sortedAgents.map((agent, idx) => {
                const Icon = ROLE_ICONS[agent.role] ?? Bot;
                const colors = ROLE_COLORS[agent.role] ?? { bg: "bg-blue-900/30", text: "text-blue-400", border: "border-l-blue-400", gradient: "from-blue-500 to-indigo-600" };
                const toolCount = (agent.toolNames as string[]).length;
                const skillCount = agent._count?.skills ?? agent.skills?.length ?? 0;
                const isLast = idx === sortedAgents.length - 1;
                return (
                  <div key={agent.name}>
                    <Link href={`/agents/${agent.name}`} className="block group">
                      <div className={`bg-slate-900 rounded-2xl border border-slate-700 border-l-[3px] ${colors.border} p-6 group-hover:shadow-md group-hover:-translate-y-0.5 transition-all duration-150 shadow-sm`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center text-white font-bold text-sm shadow-sm`}>{agent.pipelineOrder}</div>
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`p-2 rounded-lg ${colors.bg}`}><Icon className={`w-4 h-4 ${colors.text}`} /></div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold text-slate-100">{agent.displayName}</h3>
                                <span className={`w-2 h-2 rounded-full ${agent.isActive ? "bg-emerald-400" : "bg-slate-500"}`} />
                              </div>
                              <p className="text-xs text-slate-400 capitalize">{agent.role} agent</p>
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2 max-w-xs hidden lg:block">{agent.description}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400"><Wrench className="w-3 h-3" />{toolCount} tools</span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-900/30 text-purple-400"><Zap className="w-3 h-3" />{skillCount} skills</span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-500"><Cpu className="w-3 h-3" />{agent.model}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                        </div>
                      </div>
                    </Link>
                    {!isLast && <div className="flex items-center justify-center py-1.5"><div className="w-px h-4 bg-slate-700" /></div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
