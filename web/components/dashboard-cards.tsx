"use client";

import { Database, Search, Mail, TrendingUp } from "lucide-react";
import { getDashboardStats } from "../lib/api";
import type { DashboardStats } from "../lib/types";
import { usePolling } from "../lib/hooks/use-polling";

interface CardConfig {
  label: string;
  getValue: (stats: DashboardStats) => number | string;
  icon: typeof Database;
  getTrend: (stats: DashboardStats) => string;
}

const CARDS: CardConfig[] = [
  {
    label: "Total Leads",
    getValue: (s) => s.totalLeads,
    icon: Database,
    getTrend: (s) =>
      s.leadsThisWeek > 0
        ? `+${s.leadsThisWeek} this week`
        : "No new leads this week",
  },
  {
    label: "Analyzed",
    getValue: (s) => s.leadsAnalyzed,
    icon: Search,
    getTrend: (s) => {
      const pct =
        s.totalLeads > 0
          ? Math.round((s.leadsAnalyzed / s.totalLeads) * 100)
          : 0;
      return `${pct}% of total`;
    },
  },
  {
    label: "Contacted",
    getValue: (s) => s.leadsContacted,
    icon: Mail,
    getTrend: (s) => `${s.leadsResponded} responded`,
  },
  {
    label: "Conversion Rate",
    getValue: (s) => s.conversionRate + "%",
    icon: TrendingUp,
    getTrend: (s) => `${s.leadsWon} won deals`,
  },
];

function SkeletonCard() {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="p-2 rounded-lg bg-slate-700">
          <div className="w-5 h-5 bg-slate-600 rounded" />
        </div>
      </div>
      <div className="h-9 w-20 bg-slate-700 rounded mb-2" />
      <div className="h-4 w-28 bg-slate-700 rounded" />
      <div className="h-3 w-24 bg-slate-700 rounded mt-3" />
    </div>
  );
}

export function DashboardCards() {
  const { data, isLoading } = usePolling(
    () => getDashboardStats(),
    15_000,
  );

  const stats = data?.stats ?? null;

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {CARDS.map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {CARDS.map((card) => {
        const Icon = card.icon;
        const value = card.getValue(stats);
        const trend = card.getTrend(stats);
        const isPositive =
          trend.startsWith("+") || trend.includes("won") || trend.includes("responded");

        return (
          <div
            key={card.label}
            className="bg-slate-800 border border-slate-700 rounded-xl p-5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg bg-slate-700/50">
                <Icon className="w-5 h-5 text-blue-400" />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-100">{value}</p>
            <p className="text-sm text-slate-400 mt-1">{card.label}</p>
            <p
              className={`text-xs mt-3 ${
                isPositive ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {trend}
            </p>
          </div>
        );
      })}
    </div>
  );
}
