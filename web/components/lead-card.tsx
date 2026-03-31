"use client";

import { Globe, Building2, MapPin, Cpu } from "lucide-react";
import type { Lead, LeadStatus } from "../lib/types";
import { StatusBadge, ScoreBadge } from "./status-badge";

const STATUS_BORDER: Record<LeadStatus, string> = {
  discovered: "border-l-slate-400",
  analyzing: "border-l-yellow-400",
  analyzed: "border-l-indigo-400",
  contacting: "border-l-blue-400",
  responded: "border-l-amber-400",
  qualified: "border-l-purple-400",
  won: "border-l-emerald-400",
  lost: "border-l-red-400",
};

export function LeadCard({
  lead,
  onClick,
  isDragging,
  showActivity,
}: {
  lead: Lead;
  onClick: () => void;
  isDragging?: boolean;
  showActivity?: boolean;
}) {
  const score = lead.leadScore ?? lead.analyses?.[0]?.score ?? null;
  const isHighScore = score != null && score >= 80;

  return (
    <div
      onClick={onClick}
      className={`bg-slate-900 rounded-xl border border-slate-700 border-l-[3px] ${STATUS_BORDER[lead.status]} p-3.5 cursor-pointer transition-all duration-150 hover:shadow-md hover:shadow-slate-950 hover:-translate-y-0.5 ${
        isDragging ? "shadow-lg shadow-slate-900 opacity-70 rotate-2" : ""
      } ${showActivity ? "ring-1 ring-blue-600 shadow-sm shadow-blue-900/50" : ""}`}
    >
      {/* Agent activity indicator */}
      {showActivity && (
        <div className="flex items-center gap-1.5 mb-2.5 pb-2.5 border-b border-blue-800/80">
          <div className="relative">
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" />
          </div>
          <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Agent analyzing</span>
          <div className="ml-auto flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      )}

      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-sm text-slate-100 truncate flex-1 mr-2">
          {lead.businessName}
        </h3>
        <StatusBadge status={lead.status} />
      </div>

      <div className="space-y-1 text-xs text-slate-400">
        {lead.industry && (
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3 h-3 shrink-0" />
            <span className="truncate">{lead.industry}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3 h-3 shrink-0" />
          <span>{lead.city}</span>
        </div>
        {lead.website && (
          <div className="flex items-center gap-1.5">
            <Globe className="w-3 h-3 shrink-0" />
            <span className="truncate text-blue-400">{lead.website}</span>
          </div>
        )}
      </div>

      {(score != null || lead._count?.analyses || lead._count?.outreaches) && (
        <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-slate-700">
          {score != null && (
            <span className={isHighScore ? "animate-subtle-pulse" : ""}>
              <ScoreBadge score={score} />
            </span>
          )}
          {lead._count?.analyses ? (
            <span className="text-[11px] text-slate-500">{lead._count.analyses} analyses</span>
          ) : null}
          {lead._count?.outreaches ? (
            <span className="text-[11px] text-slate-500">{lead._count.outreaches} emails</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
