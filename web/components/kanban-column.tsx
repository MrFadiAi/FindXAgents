"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

const COLUMN_TINTS: Record<string, string> = {
  "bg-slate-500": "bg-slate-800/80",
  "bg-yellow-500": "bg-yellow-900/30",
  "bg-indigo-500": "bg-indigo-900/30",
  "bg-blue-500": "bg-blue-900/30",
  "bg-amber-500": "bg-amber-900/30",
  "bg-purple-500": "bg-purple-900/30",
  "bg-emerald-500": "bg-emerald-900/30",
  "bg-red-500": "bg-red-900/30",
};

const BADGE_COLORS: Record<string, string> = {
  "bg-slate-500": "bg-slate-800 text-slate-300",
  "bg-yellow-500": "bg-yellow-900/60 text-yellow-300",
  "bg-indigo-500": "bg-indigo-900/60 text-indigo-300",
  "bg-blue-500": "bg-blue-900/60 text-blue-300",
  "bg-amber-500": "bg-amber-900/60 text-amber-300",
  "bg-purple-500": "bg-purple-900/60 text-purple-300",
  "bg-emerald-500": "bg-emerald-900/60 text-emerald-300",
  "bg-red-500": "bg-red-900/60 text-red-300",
};

export function DroppableColumn({
  id,
  label,
  color,
  count,
  children,
  isActive,
}: {
  id: string;
  label: string;
  color: string;
  count: number;
  children: ReactNode;
  isActive?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const tint = COLUMN_TINTS[color] ?? "bg-slate-800";
  const badge = BADGE_COLORS[color] ?? "bg-slate-800 text-slate-400";

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 ${tint} rounded-xl border transition-all duration-300 ${
        isOver
          ? "ring-2 ring-blue-400/60 bg-blue-900/50 scale-[1.01] shadow-lg shadow-slate-900"
          : isActive
            ? "border-blue-600/80 shadow-md shadow-blue-900/50"
            : "border-slate-700/60"
      }`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-700/60">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${color} ${isActive ? "animate-pulse" : ""}`} />
          <span className="font-semibold text-sm text-slate-200">{label}</span>
          {isActive && (
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
          )}
        </div>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badge}`}>
          {count}
        </span>
      </div>

      {/* Cards */}
      <div className="overflow-y-auto max-h-[calc(100vh-340px)] kanban-scroll p-2 space-y-2">
        {children}
        {count === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-slate-500">
            <Plus className="w-5 h-5 mb-1" />
            <span className="text-xs">Drop leads here</span>
          </div>
        )}
      </div>
    </div>
  );
}
