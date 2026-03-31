"use client";

import { useState } from "react";
import { StickyNote, Plus, Clock } from "lucide-react";
import type { Lead } from "../lib/types";

interface Note {
  id: string;
  text: string;
  createdAt: string;
}

export function NotesPanel({ lead }: { lead: Lead }) {
  // Notes are stored client-side for now; would need a notes API in production
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");

  function addNote() {
    if (!text.trim()) return;
    setNotes((prev) => [
      { id: Date.now().toString(), text: text.trim(), createdAt: new Date().toISOString() },
      ...prev,
    ]);
    setText("");
  }

  return (
    <div className="space-y-4">
      {/* Add note */}
      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note about this lead..."
          rows={3}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={addNote}
          disabled={!text.trim()}
          className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium disabled:opacity-50"
        >
          <Plus className="w-3 h-3" />
          Add Note
        </button>
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-500">
          <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No notes yet
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="bg-amber-950/40 border border-amber-900/60 rounded-lg p-3">
              <p className="text-sm text-slate-200">{note.text}</p>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(note.createdAt).toLocaleString("nl-NL")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
