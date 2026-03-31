"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { getLeads, updateLead } from "../lib/api";
import { PIPELINE_STAGES, type Lead, type LeadStatus } from "../lib/types";
import { usePolling } from "../lib/hooks/use-polling";
import { LeadCard } from "./lead-card";

function LiveColumn({
  id,
  label,
  count,
  children,
}: {
  id: string;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 bg-slate-900 rounded-xl border transition-all duration-300 ${
        isOver
          ? "ring-2 ring-blue-500/60 scale-[1.01] shadow-lg shadow-blue-900/30"
          : "border-slate-700/50"
      }`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-700/50">
        <span className="text-sm font-semibold text-slate-200">{label}</span>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
          {count}
        </span>
      </div>

      {/* Cards */}
      <div className="overflow-y-auto max-h-[calc(100vh-340px)] p-2 space-y-2">
        {children}
        {count === 0 && (
          <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-slate-700/50 rounded-lg">
            <span className="text-xs text-slate-600">No leads</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function LiveKanbanBoard({
  onSelectLead,
}: {
  onSelectLead: (lead: Lead) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const { data, refetch } = usePolling(
    useCallback(() => getLeads({ pageSize: 500 }), []),
    8000,
  );

  const leads = data?.leads ?? [];
  const leadsByStatus = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    leads: leads.filter((l) => l.status === stage.key),
  }));

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
      refetch();
    } catch (err) {
      console.error("Failed to move lead:", err);
    }
  }

  return (
    <div className="bg-slate-950 rounded-xl p-4">
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
              <LiveColumn
                id={stage.key}
                label={stage.label}
                count={stage.leads.length}
              >
                {stage.leads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onClick={() => onSelectLead(lead)}
                  />
                ))}
              </LiveColumn>
            </SortableContext>
          ))}
        </div>
      </DndContext>
    </div>
  );
}
