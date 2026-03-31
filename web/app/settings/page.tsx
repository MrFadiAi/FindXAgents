"use client";

export default function SettingsPage() {
  return (
    <div className="p-8">
      <h2 className="text-lg font-bold text-slate-100">Settings</h2>
      <p className="text-sm text-slate-400">Configure API endpoints and discovery parameters.</p>

      <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-400">API Base URL</label>
          <input
            type="text"
            defaultValue="http://127.0.0.1:3001"
            className="px-3 py-2 border border-slate-700 rounded-lg text-sm w-full bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-400">Redis URL</label>
          <input
            type="text"
            defaultValue="redis://127.0.0.1:6379"
            className="px-3 py-2 border border-slate-700 rounded-lg text-sm w-full bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
    </div>
  );
}
