"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Bot,
  ArrowLeft,
  Loader2,
  Cpu,
  Wrench,
  Zap,
  Save,
  FileText,
  Eye,
  Search,
  Mail,
  ChevronRight,
  Settings,
  MessageSquare,
  Info,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { getAgent, updateAgent } from "../../../lib/api";
import type { Agent, AgentSkill } from "../../../lib/types";

const ROLE_ICONS: Record<string, React.ElementType> = {
  research: Search,
  analysis: Eye,
  outreach: Mail,
};

const ROLE_COLORS: Record<string, { bg: string; text: string; gradient: string }> = {
  research: { bg: "bg-emerald-900/30", text: "text-emerald-400", gradient: "from-emerald-500 to-teal-600" },
  analysis: { bg: "bg-indigo-900/30", text: "text-indigo-400", gradient: "from-indigo-500 to-purple-600" },
  outreach: { bg: "bg-amber-900/30", text: "text-amber-400", gradient: "from-amber-500 to-orange-600" },
};

type SettingsTab = "general" | "prompts" | "info";

export default function AgentDetailPage() {
  const params = useParams();
  const agentName = params.name as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  // Editable fields
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("");
  const [maxIterations, setMaxIterations] = useState(15);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [temperature, setTemperature] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [identityMd, setIdentityMd] = useState("");
  const [soulMd, setSoulMd] = useState("");
  const [toolsMd, setToolsMd] = useState("");

  const loadAgent = useCallback(async () => {
    try {
      const result = await getAgent(agentName);
      if (result.agent) {
        const a = result.agent;
        setAgent(a);
        setDisplayName(a.displayName);
        setDescription(a.description);
        setModel(a.model);
        setMaxIterations(a.maxIterations);
        setMaxTokens(a.maxTokens);
        setTemperature(a.temperature);
        setIsActive(a.isActive);
        setIdentityMd(a.identityMd);
        setSoulMd(a.soulMd);
        setToolsMd(a.toolsMd);
      }
    } catch {
      setError("Failed to load agent");
    } finally {
      setLoading(false);
    }
  }, [agentName]);

  useEffect(() => {
    loadAgent();
  }, [loadAgent]);

  async function handleSave() {
    if (!agent) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await updateAgent(agent.name, {
        displayName,
        description,
        model,
        maxIterations,
        maxTokens,
        temperature,
        isActive,
        identityMd,
        soulMd,
        toolsMd,
      });
      await loadAgent();
      setSuccessMessage("Agent updated successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update agent");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        <span className="ml-2 text-sm text-slate-400">Loading agent...</span>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="p-8 space-y-6">
        <Link href="/agents" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200">
          <ArrowLeft className="w-4 h-4" />
          Back to Agents
        </Link>
        <div className="bg-slate-900 rounded-2xl border border-slate-700 px-6 py-16 text-center shadow-sm">
          <Bot className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Agent &quot;{agentName}&quot; not found</p>
        </div>
      </div>
    );
  }

  const Icon = ROLE_ICONS[agent.role] ?? Bot;
  const colors = ROLE_COLORS[agent.role] ?? { bg: "bg-blue-900/30", text: "text-blue-400", gradient: "from-blue-500 to-indigo-600" };
  const toolCount = (agent.toolNames as string[]).length;
  const skillCount = agent.skills?.length ?? 0;

  const tabs: { key: SettingsTab; label: string; icon: React.ElementType }[] = [
    { key: "general", label: "General", icon: Settings },
    { key: "prompts", label: "Prompts", icon: MessageSquare },
    { key: "info", label: "Info", icon: Info },
  ];

  return (
    <div className="p-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/agents" className="hover:text-slate-300 transition-colors">Agents</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-slate-300 font-medium">{agent.displayName}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-lg shadow-slate-900/30`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-100">{agent.displayName}</h1>
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${
                agent.isActive
                  ? "bg-emerald-900/30 text-emerald-400 ring-emerald-700"
                  : "bg-slate-800 text-slate-500 ring-slate-600"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${agent.isActive ? "bg-emerald-400" : "bg-slate-500"}`} />
                {agent.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-sm text-slate-400 capitalize">{agent.role} agent &middot; <span className="font-mono text-xs">{agent.name}</span></p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition-all duration-150 shadow-sm shadow-blue-500/20"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Alerts */}
      {successMessage && (
        <div className="flex items-center gap-2 p-3 bg-emerald-900/30 text-emerald-400 rounded-xl text-sm ring-1 ring-inset ring-emerald-700">
          <Eye className="w-4 h-4 shrink-0" />
          {successMessage}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-900/30 text-red-400 rounded-xl text-sm ring-1 ring-inset ring-red-700">
          {error}
        </div>
      )}

      {/* Tab Switcher */}
      <div className="flex items-center bg-slate-800 rounded-lg p-1 w-fit">
        {tabs.map((t) => {
          const TabIcon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-150 ${
                activeTab === t.key
                  ? "bg-slate-700 text-slate-100 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <TabIcon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ===================== GENERAL TAB ===================== */}
      {activeTab === "general" && (
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 space-y-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Bot className="w-4 h-4 text-slate-500" />
              Basic Information
            </h2>

            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-700 rounded-xl text-sm bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-700 rounded-xl text-sm bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-[10px] text-slate-500 mt-1">The LLM model used by this agent</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 border border-slate-700 rounded-xl text-sm bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none placeholder:text-slate-600"
                placeholder="Describe what this agent does..."
              />
            </div>
          </div>

          {/* Performance Settings */}
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 space-y-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Settings className="w-4 h-4 text-slate-500" />
              Performance Settings
            </h2>

            <div className="grid grid-cols-3 gap-5">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Max Iterations</label>
                <input
                  type="number"
                  value={maxIterations}
                  onChange={(e) => setMaxIterations(parseInt(e.target.value, 10) || 15)}
                  min={1}
                  max={50}
                  className="w-full px-3 py-2.5 border border-slate-700 rounded-xl text-sm bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-[10px] text-slate-500 mt-1">Max tool-use loops per run</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Max Tokens</label>
                <input
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 4096)}
                  min={256}
                  max={16384}
                  step={256}
                  className="w-full px-3 py-2.5 border border-slate-700 rounded-xl text-sm bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-[10px] text-slate-500 mt-1">Response token limit</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Temperature</label>
                <input
                  type="number"
                  value={temperature ?? ""}
                  onChange={(e) => setTemperature(e.target.value ? parseFloat(e.target.value) : null)}
                  min={0}
                  max={2}
                  step={0.1}
                  placeholder="default"
                  className="w-full px-3 py-2.5 border border-slate-700 rounded-xl text-sm bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-600"
                />
                <p className="text-[10px] text-slate-500 mt-1">Creativity (0 = focused, 2 = creative)</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-700">
              <div>
                <label className="text-xs font-medium text-slate-400 block">Active Status</label>
                <p className="text-[10px] text-slate-500 mt-0.5">Inactive agents are skipped in the pipeline</p>
              </div>
              <button
                onClick={() => setIsActive(!isActive)}
                className="flex items-center gap-2 text-sm"
              >
                {isActive ? (
                  <>
                    <div className="w-10 h-5.5 bg-emerald-500 rounded-full relative">
                      <div className="absolute right-0.5 top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow-sm" />
                    </div>
                    <ToggleRight className="w-5 h-5 text-emerald-400 sr-only" />
                    <span className="text-emerald-400 font-medium text-xs">Active</span>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-5.5 bg-slate-600 rounded-full relative">
                      <div className="absolute left-0.5 top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow-sm" />
                    </div>
                    <ToggleLeft className="w-5 h-5 text-slate-500 sr-only" />
                    <span className="text-slate-500 font-medium text-xs">Inactive</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== PROMPTS TAB ===================== */}
      {activeTab === "prompts" && (
        <div className="space-y-5">
          <PromptEditor
            title="Identity"
            icon={Bot}
            description="Defines who the agent is and its core purpose"
            value={identityMd}
            onChange={setIdentityMd}
            placeholder="# Agent Identity..."
          />
          <PromptEditor
            title="Soul / Personality"
            icon={MessageSquare}
            description="The agent's personality, tone, and behavioral guidelines"
            value={soulMd}
            onChange={setSoulMd}
            placeholder="# Agent Personality..."
          />
          <PromptEditor
            title="Tools Documentation"
            icon={Wrench}
            description="Documentation for the tools available to this agent"
            value={toolsMd}
            onChange={setToolsMd}
            placeholder="# Available Tools..."
          />
        </div>
      )}

      {/* ===================== INFO TAB ===================== */}
      {activeTab === "info" && (
        <div className="grid grid-cols-3 gap-6">
          {/* Left: System Prompt */}
          <div className="col-span-2 space-y-6">
            <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-slate-500" />
                System Prompt
              </h2>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-slate-800 rounded-xl p-4 max-h-96 overflow-y-auto leading-relaxed">
                {agent.systemPrompt || "No system prompt generated yet"}
              </pre>
            </div>
          </div>

          {/* Right: Metadata */}
          <div className="space-y-6">
            {/* Agent Info */}
            <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 space-y-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-200">Agent Info</h2>
              <dl className="space-y-3">
                {[
                  { label: "Internal Name", value: agent.name, mono: true },
                  { label: "Role", value: agent.role, capitalize: true },
                  { label: "Pipeline Order", value: `#${agent.pipelineOrder}` },
                  { label: "Created", value: new Date(agent.createdAt).toLocaleDateString() },
                  { label: "Last Updated", value: new Date(agent.updatedAt).toLocaleDateString() },
                ].map((item) => (
                  <div key={item.label}>
                    <dt className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">{item.label}</dt>
                    <dd className={`text-sm text-slate-300 mt-0.5 ${item.mono ? "font-mono text-xs" : ""} ${item.capitalize ? "capitalize" : ""}`}>
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Tools */}
            <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 space-y-3 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-slate-500" />
                Tools
                <span className="text-[10px] font-medium text-slate-500 ml-auto">{toolCount}</span>
              </h2>
              {toolCount === 0 ? (
                <p className="text-xs text-slate-500">No tools configured</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(agent.toolNames as string[]).map((tool) => (
                    <span key={tool} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg bg-slate-800 text-slate-400 ring-1 ring-inset ring-slate-700">
                      <Cpu className="w-3 h-3 text-slate-500" />
                      {tool}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Skills */}
            <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 space-y-3 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Zap className="w-4 h-4 text-slate-500" />
                Skills
                <span className="text-[10px] font-medium text-slate-500 ml-auto">{skillCount}</span>
              </h2>
              {skillCount === 0 ? (
                <p className="text-xs text-slate-500">No skills configured</p>
              ) : (
                <ul className="space-y-3">
                  {agent.skills!.map((skill: AgentSkill) => (
                    <li key={skill.id} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">{skill.name}</span>
                        <span className={`w-1.5 h-1.5 rounded-full ${skill.isActive ? "bg-emerald-400" : "bg-slate-600"}`} />
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2">{skill.description}</p>
                      {(skill.toolNames as string[]).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(skill.toolNames as string[]).map((t: string) => (
                            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PromptEditor({
  title,
  icon: Icon,
  description,
  value,
  onChange,
  placeholder,
}: {
  title: string;
  icon: React.ElementType;
  description: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = value.split("\n").length;

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-800">
            <Icon className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
            <p className="text-[11px] text-slate-500">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
            {lines} lines
          </span>
          <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`} />
        </div>
      </button>
      {expanded && (
        <div className="px-6 pb-6">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={12}
            className="w-full px-4 py-3 border border-slate-700 rounded-xl text-sm font-mono bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y leading-relaxed placeholder:text-slate-600"
            placeholder={placeholder}
          />
        </div>
      )}
    </div>
  );
}
