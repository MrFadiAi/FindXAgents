"use client";

import { useState } from "react";
import { Play, FileText, AlertTriangle, Info, CheckCircle, Loader2, AlertCircle, TrendingDown, Users, Globe, Zap, Building2, ExternalLink } from "lucide-react";
import type { Lead, Analysis } from "../lib/types";
import { triggerAnalysis } from "../lib/api";

export function AnalysisPanel({ lead, onLeadUpdated }: { lead: Lead; onLeadUpdated: () => void }) {
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analyses = lead.analyses ?? [];

  async function handleAnalyze() {
    if (!lead.website) return;
    setTriggering(true);
    setError(null);
    try {
      await triggerAnalysis(lead.id, true);
      onLeadUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run analysis");
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Trigger */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleAnalyze}
          disabled={!lead.website || triggering}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {triggering ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {triggering ? "Analyzing..." : "Run Analysis"}
        </button>
        {!lead.website && (
          <span className="text-xs text-slate-500">No website to analyze</span>
        )}
      </div>

      {/* Error feedback */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-950 text-red-300 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      {analyses.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-500">
          No analyses yet. Click "Run Analysis" to start.
        </div>
      ) : (
        analyses.map((analysis) => <AnalysisCard key={analysis.id} analysis={analysis} />)
      )}
    </div>
  );
}

function AnalysisCard({ analysis }: { analysis: Analysis }) {
  const findings = Array.isArray(analysis.findings) ? analysis.findings : [];
  const opportunities = Array.isArray(analysis.opportunities) ? analysis.opportunities : [];
  const socialPresence = (analysis.socialPresence || {}) as Record<string, unknown>;
  const competitors = Array.isArray(analysis.competitors) ? analysis.competitors : [];
  const serviceGaps = Array.isArray(analysis.serviceGaps) ? analysis.serviceGaps : [];
  const revenueImpact = (analysis.revenueImpact || {}) as Record<string, unknown>;

  const severityIcon = (severity: string) => {
    if (severity === "critical") return <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />;
    if (severity === "warning") return <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />;
    return <CheckCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />;
  };

  const needBadge = (need: string) => {
    if (need === "high") return <span className="px-2 py-0.5 bg-red-900/60 text-red-300 rounded-full text-xs font-medium">High</span>;
    if (need === "medium") return <span className="px-2 py-0.5 bg-amber-900/60 text-amber-300 rounded-full text-xs font-medium">Medium</span>;
    return <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full text-xs font-medium">Low</span>;
  };

  return (
    <div className="bg-slate-800/50 rounded-xl p-4 space-y-4">
      {/* Header + Score */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-200">
          {analysis.type === "comprehensive" ? "Comprehensive Analysis" : "Analysis Results"}
        </span>
        <span className="text-xs text-slate-500">
          {new Date(analysis.analyzedAt).toLocaleString("nl-NL")}
        </span>
      </div>

      {analysis.score != null && (
        <div className="flex items-center gap-3">
          <div className={`text-3xl font-bold ${analysis.score >= 70 ? "text-red-400" : analysis.score >= 40 ? "text-amber-400" : "text-emerald-400"}`}>
            {analysis.score}
          </div>
          <div>
            <span className="text-sm text-slate-400">/ 100 revenue-at-risk score</span>
            <p className="text-xs text-slate-500">Higher = more money being left on the table</p>
          </div>
        </div>
      )}

      {/* Revenue Impact */}
      {revenueImpact.totalEstimatedLoss != null && (
        <div className="bg-red-950/50 border border-red-900/60 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <span className="text-sm font-semibold text-red-300">Estimated Revenue at Risk</span>
          </div>
          <div className="text-2xl font-bold text-red-400">
            &euro;{Number(revenueImpact.totalEstimatedLoss).toLocaleString("nl-NL")}
            <span className="text-sm font-normal text-red-400/70">/month</span>
          </div>
          {Array.isArray(revenueImpact.breakdown) && (revenueImpact.breakdown as Array<{ area: string; estimatedLoss: number }>).length > 0 && (
            <div className="mt-2 space-y-1">
              {(revenueImpact.breakdown as Array<{ area: string; estimatedLoss: number }>).map((b, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-red-400">{b.area}</span>
                  <span className="text-red-300 font-medium">&euro;{Number(b.estimatedLoss).toLocaleString("nl-NL")}/mo</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Service Opportunities — THE KEY SECTION */}
      {serviceGaps.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2 flex items-center gap-1">
            <Zap className="w-3 h-3" /> Service Opportunities
          </h4>
          <div className="space-y-2">
            {(serviceGaps as Array<{ service: string; need: string; reasoning: string; estimatedRevenueImpact?: string }>).map((gap, i) => (
              <div key={i} className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-200">{gap.service}</span>
                  {needBadge(gap.need)}
                </div>
                <p className="text-xs text-slate-400">{gap.reasoning}</p>
                {gap.estimatedRevenueImpact && (
                  <p className="text-xs text-emerald-400 font-medium mt-1">&euro; {gap.estimatedRevenueImpact}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2 flex items-center gap-1">
            <FileText className="w-3 h-3" /> Findings
          </h4>
          <div className="space-y-2">
            {(findings as Array<{ severity: string; title: string; description?: string; category?: string }>).slice(0, 10).map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {severityIcon(f.severity)}
                <div>
                  <p className="text-slate-200">{f.title}</p>
                  {f.description && <p className="text-xs text-slate-500">{f.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Competitors */}
      {competitors.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2 flex items-center gap-1">
            <Building2 className="w-3 h-3" /> Competitors
          </h4>
          <div className="space-y-2">
            {(competitors as Array<{ name: string; website?: string; strengths?: string; weaknesses?: string; score?: number }>).map((c, i) => (
              <div key={i} className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-200">{c.name}</span>
                  {c.website && (
                    <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                {c.strengths && <p className="text-xs text-emerald-400">+ {c.strengths}</p>}
                {c.weaknesses && <p className="text-xs text-red-400">- {c.weaknesses}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Social Presence */}
      {Object.keys(socialPresence).length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2 flex items-center gap-1">
            <Globe className="w-3 h-3" /> Social Presence
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {["linkedin", "facebook", "instagram", "googleBusiness"].map((platform) => {
              const data = socialPresence[platform] as Record<string, unknown> | undefined;
              if (!data) return null;
              const labels: Record<string, string> = { linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram", googleBusiness: "Google Business" };
              return (
                <div key={platform} className="bg-slate-900 rounded-lg p-2 border border-slate-700">
                  <span className="text-xs font-medium text-slate-300">{labels[platform]}</span>
                  {data.rating != null && <span className="ml-2 text-xs text-amber-400">&#9733; {String(data.rating)}</span>}
                  {data.reviewCount != null && <span className="ml-1 text-xs text-slate-500">({String(data.reviewCount)} reviews)</span>}
                  {data.found === false && <span className="text-xs text-red-400 ml-1">Not found</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Opportunities */}
      {opportunities.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2 flex items-center gap-1">
            <Users className="w-3 h-3" /> Opportunities
          </h4>
          <div className="space-y-1">
            {(opportunities as Array<{ title: string; description?: string; impact?: string }>).slice(0, 5).map((o, i) => (
              <div key={i} className="text-sm text-slate-300">
                <span className="font-medium">{o.title}</span>
                {o.impact && <span className="text-xs text-slate-500 ml-2">({o.impact})</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
