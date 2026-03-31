"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, CheckCircle2, XCircle, Wrench, Clock, Filter, ChevronDown } from "lucide-react";
import { getRunLogs } from "../lib/api";
import type { AgentLog } from "../lib/types";

const LEVEL_STYLES: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  info: { bg: "bg-blue-50", text: "text-blue-700", icon: Clock },
  success: { bg: "bg-emerald-50", text: "text-emerald-700", icon: CheckCircle2 },
  error: { bg: "bg-red-50", text: "text-red-700", icon: XCircle },
  warn: { bg: "bg-amber-50", text: "text-amber-700", icon: Clock },
};

const PHASE_OPTIONS = [
  { key: "all", label: "All" },
  { key: "research", label: "Research" },
  { key: "analysis", label: "Analysis" },
  { key: "outreach", label: "Outreach" },
];

interface AgentMonitorProps {
  pipelineRunId: string;
  maxHeight?: number;
  status?: string;
}

export function AgentMonitor({ pipelineRunId, maxHeight = 600, status }: AgentMonitorProps) {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pipelineRunId) return;

    let cancelled = false;

    async function poll() {
      try {
        const result = await getRunLogs(pipelineRunId);
        if (!cancelled) {
          setLogs(result.logs);
          setLoading(false);

          if (scrollRef.current) {
            const el = scrollRef.current;
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
            if (nearBottom) {
              el.scrollTop = el.scrollHeight;
            }
          }
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    poll();
    let interval: ReturnType<typeof setInterval> | undefined;
    if (status !== "completed" && status !== "failed" && status !== "partial" && status !== "cancelled") {
      interval = setInterval(poll, 3000);
    }
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [pipelineRunId, status]);

  const filteredLogs = phaseFilter === "all"
    ? logs
    : logs.filter((log) => log.phase?.toLowerCase() === phaseFilter);

  const isDone = status === "completed" || status === "failed" || status === "partial" || status === "cancelled";

  return (
    <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
      {/* Header — clickable toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full px-5 py-3.5 flex items-center justify-between hover:bg-slate-900/50 transition-colors ${
          expanded ? "border-b border-slate-800" : ""
        }`}
      >
        <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-2.5">
          {isDone ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          )}
          Live Monitor
          <span className="text-[10px] font-normal text-slate-500 ml-1">{filteredLogs.length} events</span>
        </h3>
        <ChevronDown
          className={`w-4 h-4 text-slate-500 transition-transform duration-150 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Content — only when expanded */}
      {expanded && (
        <>
          {/* Phase Filter */}
          <div className="flex items-center justify-end px-5 py-2 border-b border-slate-800">
            <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-0.5">
              <Filter className="w-3 h-3 text-slate-500 mr-1" />
              {PHASE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setPhaseFilter(opt.key)}
                  className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all duration-100 ${
                    phaseFilter === opt.key
                      ? "bg-slate-800 text-slate-200"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Log Area */}
          <div
            ref={scrollRef}
            className="overflow-y-auto font-mono text-xs leading-relaxed"
            style={{ maxHeight }}
          >
            {loading && logs.length === 0 ? (
              <div className="px-5 py-10 text-center text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-3" />
                <p className="text-xs">Waiting for agent activity...</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="px-5 py-10 text-center text-slate-500">
                <p className="text-xs">No events{phaseFilter !== "all" ? ` for ${phaseFilter} phase` : " yet"}</p>
              </div>
            ) : (
              filteredLogs.map((log) => {
                const style = LEVEL_STYLES[log.level] ?? LEVEL_STYLES.info;
                const Icon = style.icon;
                const time = new Date(log.createdAt).toLocaleTimeString();

                return (
                  <div
                    key={log.id}
                    className="px-5 py-2.5 border-b border-slate-800/50 hover:bg-slate-900/60 transition-colors"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-slate-600 shrink-0 w-16 text-[10px] mt-0.5">{time}</span>
                      <Icon className={`w-3 h-3 mt-1 shrink-0 ${style.text}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-500 font-semibold text-[10px] uppercase tracking-wide">
                            {log.phase}
                          </span>
                          <span className="text-slate-300">{log.message}</span>
                        </div>

                        {log.toolName && (
                          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                              <Wrench className="w-2.5 h-2.5" />
                              {log.toolName}
                            </span>
                            {log.duration != null && (
                              <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                                {log.duration}ms
                              </span>
                            )}
                            {log.tokens != null && (
                              <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                                {log.tokens} tokens
                              </span>
                            )}
                          </div>
                        )}

                        {log.toolInput && (
                          <pre className="mt-1.5 text-[10px] text-slate-500 whitespace-pre-wrap break-all max-h-20 overflow-hidden bg-slate-900/50 rounded-lg p-2">
                            {JSON.stringify(log.toolInput, null, 2).slice(0, 300)}
                          </pre>
                        )}

                        {log.toolOutput && (
                          <pre className="mt-1.5 text-[10px] text-emerald-600 whitespace-pre-wrap break-all max-h-20 overflow-hidden bg-slate-900/50 rounded-lg p-2">
                            {log.toolOutput.slice(0, 300)}
                          </pre>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
