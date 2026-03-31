"use client";

import { useState } from "react";
import { DashboardCards } from "../components/dashboard-cards";
import { LiveKanbanBoard } from "../components/live-kanban-board";
import { ActivityFeed } from "../components/activity-feed";
import { AgentRunHistory } from "../components/agent-run-history";
import { LeadDetailPanel } from "../components/lead-detail-panel";
import type { Lead } from "../lib/types";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function Home() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  return (
    <div className="min-h-screen bg-slate-950 p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">
          {getGreeting()}
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {formatDate()} &middot; Pipeline overview
        </p>
      </div>

      {/* Metrics row */}
      <DashboardCards />

      {/* Main content: Kanban (2/3) + Right panel (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kanban board - 2/3 width */}
        <div className="lg:col-span-2">
          <LiveKanbanBoard onSelectLead={setSelectedLead} />
        </div>

        {/* Right side panel - 1/3 width */}
        <div className="space-y-6">
          <ActivityFeed />
          <AgentRunHistory />
        </div>
      </div>

      {/* Lead detail overlay */}
      {selectedLead && (
        <LeadDetailPanel
          leadId={selectedLead.id}
          onClose={() => setSelectedLead(null)}
          onLeadUpdated={() => {}}
        />
      )}
    </div>
  );
}
