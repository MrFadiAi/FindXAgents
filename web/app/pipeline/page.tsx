"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { RefreshCw, Loader2, Activity, Zap } from "lucide-react";
import { DroppableColumn } from "../../components/kanban-column";
import { LeadCard } from "../../components/lead-card";
import { StatusBadge } from "../../components/status-badge";
import { LeadDetailPanel } from "../../components/lead-detail-panel";
import {
  getLeads,
  getAgentRuns,
  updateLead,
} from "../../lib/api";
import { PIPELINE_STAGES } from "../../lib/types";
import type { Lead, LeadStatus, AgentPipelineRun } from "../../lib/types";

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeRuns, setActiveRuns] = useState<AgentPipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [stageFilter, setStageFilter] = useState<LeadStatus | "all">("all");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const filteredStages =
    stageFilter === "all"
      ? PIPELINE_STAGES
      : PIPELINE_STAGES.filter((s) => s.key === stageFilter);

  const leadsByStatus = filteredStages.map((stage) => ({
    ...stage,
    leads: leads.filter((l) => l.status === stage.key),
  }));

  const activeLead = activeId
    ? leads.find((l) => l.id === activeId)
    : null;

  const fetchLeads = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await getLeads({ pageSize: 200 });
      setLeads(res.leads);
    } catch (err) {
      console.error("Failed to load leads:", err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const fetchActiveRuns = useCallback(async () => {
    try {
      const res = await getAgentRuns();
      setActiveRuns(res.runs.filter((r) => r.status === "running" || r.status === "queued"));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchLeads(true);
    fetchActiveRuns();
  }, [fetchLeads, fetchActiveRuns]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchLeads();
      fetchActiveRuns();
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchLeads, fetchActiveRuns]);

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const leadId = String(active.id);
    const newStatus = String(over.id) as LeadStatus;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === newStatus) return;

    try {
      await updateLead(leadId, { status: newStatus });
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)),
      );
    } catch (err) {
      console.error("Failed to move lead:", err);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-200">Pipeline</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {leads.length} leads across {PIPELINE_STAGES.length} stages
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Stage filter */}
            <select
              value={stageFilter}
              onChange={(e) =>
                setStageFilter(e.target.value as LeadStatus | "all")
              }
              className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-600"
            >
              <option value="all">All stages</option>
              {PIPELINE_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            {/* Refresh */}
            <button
              onClick={() => fetchLeads()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Refresh
            </button>
          </div>
        </div>

        {/* Active runs summary */}
        {activeRuns.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 mb-6 bg-slate-900 rounded-xl border border-slate-700">
            <div className="relative">
              <Activity className="w-4 h-4 text-blue-400" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full" />
            </div>
            <span className="text-xs font-medium text-slate-300">
              {activeRuns.length} active {activeRuns.length === 1 ? "run" : "runs"}
            </span>
            {activeRuns.slice(0, 3).map((run) => (
              <span
                key={run.id}
                className="flex items-center gap-1.5 text-xs text-slate-500"
              >
                <Zap className="w-3 h-3 text-amber-500" />
                <span className="truncate max-w-[200px]">{run.query}</span>
                <StatusBadge status={run.status === "running" ? "analyzing" : "discovered"} />
              </span>
            ))}
          </div>
        )}

        {/* Kanban board */}
        {loading && leads.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div
              className="flex gap-3 overflow-x-auto pb-4 kanban-scroll"
              style={{ minHeight: 480 }}
            >
              {leadsByStatus.map((stage) => (
                <SortableContext
                  key={stage.key}
                  items={stage.leads.map((l) => l.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <DroppableColumn
                    id={stage.key}
                    label={stage.label}
                    color={stage.color}
                    count={stage.leads.length}
                  >
                    {stage.leads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        onClick={() => setSelectedLead(lead)}
                      />
                    ))}
                  </DroppableColumn>
                </SortableContext>
              ))}
            </div>
            <DragOverlay>
              {activeLead ? (
                <LeadCard lead={activeLead} onClick={() => {}} isDragging />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Lead detail overlay */}
      {selectedLead && (
        <LeadDetailPanel
          leadId={selectedLead.id}
          onClose={() => setSelectedLead(null)}
          onLeadUpdated={() => fetchLeads()}
        />
      )}
    </div>
  );
}
