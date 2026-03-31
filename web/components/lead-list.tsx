"use client";

import { useState } from "react";
import { ArrowUpDown, Globe, Building2, MapPin, ExternalLink } from "lucide-react";
import type { Lead, LeadStatus } from "../lib/types";
import { StatusBadge, ScoreBadge } from "./status-badge";
import { getLeads } from "../lib/api";
import { usePolling } from "../lib/hooks/use-polling";

interface LeadListProps {
  onSelectLead: (lead: Lead) => void;
}

type SortKey = "discoveredAt" | "businessName" | "city" | "status";
type SortDir = "asc" | "desc";

export function LeadList({ onSelectLead }: LeadListProps) {
  const { data } = usePolling(() => getLeads({ pageSize: 200 }), 5_000);
  const leads = data?.leads ?? [];

  const [sortKey, setSortKey] = useState<SortKey>("discoveredAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [search, setSearch] = useState("");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  let filtered = leads;
  if (filterStatus) filtered = filtered.filter((l) => l.status === filterStatus);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (l) =>
        l.businessName.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q) ||
        (l.industry?.toLowerCase().includes(q) ?? false),
    );
  }

  const sorted = [...filtered].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    if (sortKey === "discoveredAt")
      return mul * (new Date(a.discoveredAt).getTime() - new Date(b.discoveredAt).getTime());
    return mul * String(a[sortKey]).localeCompare(String(b[sortKey]));
  });

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-3">
        <input
          type="text"
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-xs px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All statuses</option>
          <option value="discovered">New</option>
          <option value="analyzing">Analyzing</option>
          <option value="analyzed">Analyzed</option>
          <option value="contacting">Contacted</option>
          <option value="responded">Responded</option>
          <option value="qualified">Qualified</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
        <span className="text-xs text-slate-400">{sorted.length} leads</span>
      </div>

      {/* Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50">
              {[
                { key: "businessName", label: "Business" },
                { key: "city", label: "City" },
                { key: "discoveredAt", label: "Discovered" },
                { key: "status", label: "Status" },
              ].map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key as SortKey)}
                  className="text-left px-4 py-3 text-xs font-semibold text-slate-400 cursor-pointer hover:text-slate-200"
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
              ))}
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400">Score</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400">Website</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((lead) => (
              <tr
                key={lead.id}
                onClick={() => onSelectLead(lead)}
                className="border-b border-slate-800 hover:bg-blue-950/50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-sm text-slate-100">{lead.businessName}</p>
                    {lead.industry && (
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {lead.industry}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {lead.city}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {new Date(lead.discoveredAt).toLocaleDateString("nl-NL")}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={lead.status} />
                </td>
                <td className="px-4 py-3">
                  {lead.leadScore != null ? (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      lead.leadScore >= 70 ? "bg-emerald-900/60 text-emerald-300" :
                      lead.leadScore >= 40 ? "bg-amber-900/60 text-amber-300" :
                      "bg-red-900/60 text-red-300"
                    }`}>
                      {lead.leadScore}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-600">--</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {lead.website ? (
                    <a
                      href={lead.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Globe className="w-3 h-3" />
                      <span className="truncate max-w-[120px]">{lead.website}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-slate-600">None</span>
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-sm text-slate-500">
                  No leads found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
