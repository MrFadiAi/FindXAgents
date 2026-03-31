"use client";

import {
  Users,
  Mail,
  Target,
  CheckCircle,
  TrendingUp,
  Globe,
  ArrowRight,
  Zap,
} from "lucide-react";
import type { DashboardStats } from "../lib/types";
import { getDashboardStats } from "../lib/api";
import { usePolling } from "../lib/hooks/use-polling";

export function MetricsBar() {
  const { data } = usePolling(() => getDashboardStats(), 10_000);
  const stats = data?.stats ?? ({} as DashboardStats);

  const totalLeads = stats.totalLeads ?? 0;
  const leadsContacted = stats.leadsContacted ?? 0;
  const leadsResponded = stats.leadsResponded ?? 0;
  const leadsWon = stats.leadsWon ?? 0;
  const leadsAnalyzed = stats.leadsAnalyzed ?? 0;
  const leadsThisWeek = stats.leadsThisWeek ?? 0;
  const conversionRate = stats.conversionRate ?? 0;

  const contactRate =
    totalLeads > 0
      ? Math.round((leadsContacted / totalLeads) * 100)
      : 0;
  const responseRate =
    leadsContacted > 0
      ? Math.round((leadsResponded / leadsContacted) * 100)
      : 0;
  const winRate =
    leadsResponded > 0
      ? Math.round((leadsWon / leadsResponded) * 100)
      : 0;

  return (
    <div className="space-y-4 mb-8">
      {/* Top stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Leads"
          value={totalLeads}
          subtitle={`${leadsAnalyzed} analyzed`}
          icon={Users}
          gradient="from-slate-800 to-slate-900"
          accent="slate"
        />
        <StatCard
          label="This Week"
          value={leadsThisWeek}
          subtitle="new leads found"
          icon={TrendingUp}
          gradient="from-blue-600 to-indigo-700"
          accent="blue"
          highlight
        />
        <StatCard
          label="Conversion"
          value={`${conversionRate}%`}
          subtitle={`${leadsWon} won deals`}
          icon={Zap}
          gradient="from-emerald-600 to-teal-700"
          accent="emerald"
        />
        <StatCard
          label="Responded"
          value={leadsResponded}
          subtitle={`of ${leadsContacted} contacted`}
          icon={Target}
          gradient="from-amber-600 to-orange-700"
          accent="amber"
        />
      </div>

      {/* Pipeline funnel */}
      <div className="bg-slate-900 rounded-2xl border border-slate-700 p-5 shadow-sm shadow-slate-950">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-200">Pipeline Funnel</h3>
          <span className="text-xs text-slate-400">{totalLeads} total</span>
        </div>
        <div className="flex items-center gap-2">
          <FunnelStep label="Leads" count={totalLeads} total={totalLeads} color="bg-slate-500" />
          <ArrowRight className="w-4 h-4 text-slate-600 shrink-0" />
          <FunnelStep label="Contacted" count={leadsContacted} total={totalLeads} color="bg-blue-500" pct={contactRate} />
          <ArrowRight className="w-4 h-4 text-slate-600 shrink-0" />
          <FunnelStep label="Responded" count={leadsResponded} total={totalLeads} color="bg-purple-500" pct={responseRate} />
          <ArrowRight className="w-4 h-4 text-slate-600 shrink-0" />
          <FunnelStep label="Won" count={leadsWon} total={totalLeads} color="bg-emerald-500" pct={winRate} highlight />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
  gradient,
  accent,
  highlight = false,
}: {
  label: string;
  value: number | string;
  subtitle: string;
  icon: typeof Users;
  gradient: string;
  accent: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-5 ${
        highlight
          ? "bg-gradient-to-br " + gradient + " text-white shadow-lg shadow-blue-500/10"
          : "bg-slate-900 border border-slate-700 shadow-sm shadow-slate-950"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p
            className={`text-xs font-medium ${
              highlight ? "text-white/70" : "text-slate-400"
            }`}
          >
            {label}
          </p>
          <p
            className={`text-2xl font-bold mt-1 ${
              highlight ? "text-white" : "text-slate-100"
            }`}
          >
            {value}
          </p>
          <p
            className={`text-xs mt-1 ${
              highlight ? "text-white/60" : "text-slate-400"
            }`}
          >
            {subtitle}
          </p>
        </div>
        <div
          className={`p-2.5 rounded-xl ${
            highlight
              ? "bg-white/10"
              : accent === "emerald"
                ? "bg-emerald-900/50"
                : accent === "amber"
                  ? "bg-amber-900/50"
                  : "bg-slate-800"
          }`}
        >
          <Icon
            className={`w-5 h-5 ${
              highlight
                ? "text-white/80"
                : accent === "emerald"
                  ? "text-emerald-400"
                  : accent === "amber"
                    ? "text-amber-400"
                    : "text-slate-400"
            }`}
          />
        </div>
      </div>
      {/* Decorative circle */}
      <div
        className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full ${
          highlight ? "bg-white/[0.06]" : "bg-slate-800"
        }`}
      />
    </div>
  );
}

function FunnelStep({
  label,
  count,
  total,
  color,
  pct,
  highlight = false,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  pct?: number;
  highlight?: boolean;
}) {
  const widthPct = total > 0 ? Math.max(8, (count / total) * 100) : 8;

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-xs font-medium ${highlight ? "text-emerald-400" : "text-slate-300"}`}>
          {label}
        </span>
        <span className={`text-xs font-bold ${highlight ? "text-emerald-400" : "text-slate-100"}`}>
          {count}
        </span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      {pct !== undefined && (
        <p className="text-[10px] text-slate-400 mt-1">{pct}% of previous</p>
      )}
    </div>
  );
}
