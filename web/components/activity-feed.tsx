"use client";

import { useMemo } from "react";
import { getLeads, getAgentRuns } from "../lib/api";
import type { Lead, AgentPipelineRun } from "../lib/types";
import { usePolling } from "../lib/hooks/use-polling";

type ActivityItem = {
  id: string;
  icon: string;
  description: string;
  timestamp: string;
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  return new Date(dateStr).toLocaleDateString();
}

function buildActivityItems(
  leads: Lead[],
  runs: AgentPipelineRun[],
): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const lead of leads) {
    items.push({
      id: `lead-${lead.id}`,
      icon: "\uD83D\uDFE2",
      description: `New lead: ${lead.businessName} in ${lead.city}`,
      timestamp: lead.discoveredAt ?? lead.createdAt,
    });

    if (Array.isArray(lead.analyses)) {
      for (const a of lead.analyses) {
      items.push({
        id: `analysis-${a.id}`,
        icon: "\uD83D\uDD0D",
        description: `Analysis complete for ${lead.businessName} (score: ${a.score ?? "N/A"})`,
        timestamp: a.analyzedAt,
      });
      }
    }

    if (Array.isArray(lead.outreaches)) {
      for (const o of lead.outreaches) {
        const label = o.status === "sent" ? "sent" : o.status === "draft" ? "drafted" : o.status;
          items.push({
          id: `outreach-${o.id}`,
          icon: o.status === "sent" ? "📧" : "✉️",
          description: `Email ${label} for ${lead.businessName}`,
          timestamp: o.sentAt ?? o.createdAt,
        });
      }
    }
  }

  for (const run of runs) {
    const isFailed = run.status === "failed";
    items.push({
      id: `run-${run.id}`,
      icon: isFailed ? "\u26A0\uFE0F" : "\uD83E\uDD16",
      description: isFailed
        ? `Agent pipeline run failed: ${run.error ?? "unknown error"}`
        : `Agent pipeline run ${run.status}`,
      timestamp: run.completedAt ?? run.createdAt,
    });
  }

  items.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return items.slice(0, 10);
}

function SkeletonItems() {
  return (
    <div className="space-y-3 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3 animate-pulse">
          <div className="w-5 h-5 rounded bg-slate-700 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-slate-700 rounded w-3/4" />
            <div className="h-2 bg-slate-700/60 rounded w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActivityFeed() {
  const { data: leadsData, isLoading: leadsLoading } = usePolling(
    () => getLeads({ pageSize: 10 }),
    10_000,
  );

  const { data: runsData, isLoading: runsLoading } = usePolling(
    () => getAgentRuns(),
    10_000,
  );

  const items = useMemo<ActivityItem[]>(() => {
    if (!leadsData && !runsData) return [];
    return buildActivityItems(
      leadsData?.leads ?? [],
      runsData?.runs ?? [],
    );
  }, [leadsData, runsData]);

  const isLoading = leadsLoading || runsLoading;

  return (
    <div className="bg-slate-900/95 border border-slate-700 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-200">
          Recent Activity
        </h3>
      </div>

      <div className="overflow-y-auto max-h-[400px]">
        {isLoading && items.length === 0 ? (
          <SkeletonItems />
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
            No recent activity
          </div>
        ) : (
          <ul className="divide-y divide-slate-700/50">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 px-4 py-3 bg-slate-800/50 hover:bg-slate-800/80 transition-colors"
              >
                <span className="text-base shrink-0 mt-0.5 leading-none">
                  {item.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 truncate">
                    {item.description}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatRelativeTime(item.timestamp)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
