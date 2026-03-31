import { STATUS_LABELS, type LeadStatus } from "../lib/types";

const STATUS_STYLES: Record<LeadStatus, string> = {
  discovered: "bg-slate-800 text-slate-300 ring-slate-700",
  analyzing: "bg-yellow-900/60 text-yellow-300 ring-yellow-800",
  analyzed: "bg-indigo-900/60 text-indigo-300 ring-indigo-800",
  contacting: "bg-blue-900/60 text-blue-300 ring-blue-800",
  responded: "bg-amber-900/60 text-amber-300 ring-amber-800",
  qualified: "bg-purple-900/60 text-purple-300 ring-purple-800",
  won: "bg-emerald-900/60 text-emerald-300 ring-emerald-800",
  lost: "bg-red-900/60 text-red-300 ring-red-800",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return null;

  const color =
    score >= 80
      ? "text-emerald-300 bg-emerald-900/60 ring-emerald-800"
      : score >= 50
        ? "text-amber-300 bg-amber-900/60 ring-amber-800"
        : "text-red-300 bg-red-900/60 ring-red-800";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ring-1 ring-inset ${color}`}>
      {score}
    </span>
  );
}

export function ScoreRing({ score, size = 40 }: { score: number | null | undefined; size?: number }) {
  if (score == null) return null;

  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  const colorClass =
    score >= 80 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-red-500";

  const trackColor =
    score >= 80 ? "stroke-emerald-900" : score >= 50 ? "stroke-amber-900" : "stroke-red-900";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className={trackColor}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke="currentColor"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className={`${colorClass} transition-all duration-500`}
        />
      </svg>
      <span className={`absolute text-[11px] font-bold ${colorClass}`}>
        {score}
      </span>
    </div>
  );
}
