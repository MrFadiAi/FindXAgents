"use client";

import { useState, useEffect } from "react";
import {
  X,
  Globe,
  Building2,
  MapPin,
  Phone,
  Mail,
  ExternalLink,
  FileText,
  Send,
  BarChart3,
  StickyNote,
  Clock,
} from "lucide-react";
import type { Lead } from "../lib/types";
import { getLead } from "../lib/api";
import { StatusBadge, ScoreBadge } from "./status-badge";
import { AnalysisPanel } from "./analysis-panel";
import { OutreachPanel } from "./outreach-panel";
import { NotesPanel } from "./notes-panel";

interface LeadDetailPanelProps {
  leadId: string | null;
  onClose: () => void;
  onLeadUpdated: () => void;
}

type Tab = "overview" | "analysis" | "outreach" | "notes";

export function LeadDetailPanel({ leadId, onClose, onLeadUpdated }: LeadDetailPanelProps) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);

  async function refreshLead() {
    if (!leadId) return;
    try {
      const res = await getLead(leadId);
      setLead(res.lead);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    setTab("overview");
    getLead(leadId)
      .then((res) => setLead(res.lead))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [leadId]);

  if (!leadId) return null;

  const tabs: { key: Tab; label: string; icon: typeof FileText }[] = [
    { key: "overview", label: "Overview", icon: FileText },
    { key: "analysis", label: "Analysis", icon: BarChart3 },
    { key: "outreach", label: "Email", icon: Send },
    { key: "notes", label: "Notes", icon: StickyNote },
  ];

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-slate-900 shadow-2xl shadow-slate-950 z-50 flex flex-col border-l border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg text-slate-100 truncate">{lead?.businessName ?? "Loading..."}</h2>
          {lead && <StatusBadge status={lead.status} />}
        </div>
        <button
          onClick={onClose}
          aria-label="Close lead detail panel"
          className="ml-3 p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700 px-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? "border-blue-400 text-blue-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500">
            Loading...
          </div>
        ) : !lead ? (
          <div className="text-center py-12 text-sm text-slate-500">Lead not found</div>
        ) : tab === "overview" ? (
          <OverviewTab lead={lead} />
        ) : tab === "analysis" ? (
          <AnalysisPanel lead={lead} onLeadUpdated={() => { refreshLead(); onLeadUpdated(); }} />
        ) : tab === "outreach" ? (
          <OutreachPanel lead={lead} onLeadUpdated={() => { refreshLead(); onLeadUpdated(); }} />
        ) : (
          <NotesPanel lead={lead} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({ lead }: { lead: Lead }) {
  const timeline = [
    ...(lead.analyses ?? []).map((a) => ({
      type: "analysis" as const,
      date: a.analyzedAt,
      title: `Analysis completed — Score: ${a.score ?? "N/A"}`,
    })),
    ...(lead.outreaches ?? []).map((o) => ({
      type: "outreach" as const,
      date: o.sentAt ?? o.createdAt,
      title: `Email ${o.status}: ${o.subject}`,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-5">
      {/* Contact Info */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-slate-400 uppercase tracking-wider">Contact Info</h3>
        <div className="space-y-2">
          {lead.industry && (
            <div className="flex items-center gap-2 text-sm text-slate-200">
              <Building2 className="w-4 h-4 text-slate-500" />
              <span>{lead.industry}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <MapPin className="w-4 h-4 text-slate-500" />
            <span>{[lead.address, lead.city].filter(Boolean).join(", ")}</span>
          </div>
          {lead.phone && (
            <div className="flex items-center gap-2 text-sm text-slate-200">
              <Phone className="w-4 h-4 text-slate-500" />
              <span>{lead.phone}</span>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-2 text-sm text-slate-200">
              <Mail className="w-4 h-4 text-slate-500" />
              <span>{lead.email}</span>
            </div>
          )}
          {lead.website && (
            <div className="flex items-center gap-2 text-sm text-slate-200">
              <Globe className="w-4 h-4 text-slate-500" />
              <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline flex items-center gap-1">
                {lead.website}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Latest Analysis Score */}
      {(lead.analyses ?? []).length > 0 && (
        <div>
          <h3 className="font-semibold text-sm text-slate-400 uppercase tracking-wider mb-2">Latest Score</h3>
          <ScoreBadge score={(lead.analyses ?? [])[0]?.score} />
        </div>
      )}

      {/* Source */}
      <div>
        <h3 className="font-semibold text-sm text-slate-400 uppercase tracking-wider mb-1">Source</h3>
        <p className="text-sm text-slate-300">{lead.source}</p>
        {lead.kvkNumber && <p className="text-xs text-slate-500">KVK: {lead.kvkNumber}</p>}
      </div>

      {/* Timeline */}
      <div>
        <h3 className="font-semibold text-sm text-slate-400 uppercase tracking-wider mb-3">Timeline</h3>
        {timeline.length === 0 ? (
          <p className="text-sm text-slate-500">No activity yet</p>
        ) : (
          <div className="space-y-3">
            {timeline.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                  item.type === "analysis" ? "bg-indigo-400" : "bg-blue-400"
                }`} />
                <div>
                  <p className="text-sm text-slate-200">{item.title}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(item.date).toLocaleString("nl-NL")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
