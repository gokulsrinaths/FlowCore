"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const pipeline = [
  { stage: "Created", count: 24, fill: "#2ee6ff" },
  { stage: "Active", count: 58, fill: "#4d9fff" },
  { stage: "Review", count: 31, fill: "#a78bfa" },
  { stage: "Done", count: 142, fill: "#5cfc7c" },
];

const throughput = [
  { wk: "W1", items: 42 },
  { wk: "W2", items: 51 },
  { wk: "W3", items: 48 },
  { wk: "W4", items: 67 },
  { wk: "W5", items: 73 },
  { wk: "W6", items: 81 },
];

const capabilities = [
  { axis: "Stages", value: 98 },
  { axis: "RBAC", value: 95 },
  { axis: "Audit", value: 100 },
  { axis: "Cases", value: 88 },
  { axis: "Search", value: 82 },
];

const tooltipStyle = {
  backgroundColor: "rgba(6, 10, 20, 0.95)",
  border: "1px solid rgba(46, 230, 255, 0.25)",
  borderRadius: 6,
  fontSize: 11,
  color: "#e2e8f0",
};

function PanelFrame({
  fig,
  title,
  subtitle,
  children,
  className = "",
}: {
  fig: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-cyan-500/20 bg-[rgba(8,14,28,0.72)] shadow-[inset_0_1px_0_rgba(46,230,255,0.06)] backdrop-blur-sm ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(46,230,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(46,230,255,0.03)_1px,transparent_1px)]"
        style={{ backgroundSize: "20px 20px" }}
      />
      <div className="pointer-events-none absolute left-0 top-0 size-3 border-l-2 border-t-2 border-cyan-400/50" />
      <div className="pointer-events-none absolute right-0 top-0 size-3 border-r-2 border-t-2 border-cyan-400/50" />
      <div className="pointer-events-none absolute bottom-0 left-0 size-3 border-b-2 border-l-2 border-cyan-400/40" />
      <div className="pointer-events-none absolute bottom-0 right-0 size-3 border-b-2 border-r-2 border-cyan-400/40" />
      <header className="relative border-b border-cyan-500/15 px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-400/80">
          {fig}
        </p>
        <h3 className="text-sm font-medium tracking-tight text-slate-100">{title}</h3>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{subtitle}</p>
        ) : null}
      </header>
      <div className="relative h-[200px] min-h-[180px] min-w-0 w-full px-1 pb-2 pt-1 sm:h-[220px]">
        {children}
      </div>
    </div>
  );
}

export function MissionDashboard() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:gap-3">
      <PanelFrame
        className="lg:col-span-5"
        fig="FIG 01 · PIPELINE"
        title="Items by stage"
        subtitle="Representative load across enforced workflow states — no ad-hoc columns."
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={pipeline} layout="vertical" margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,230,255,0.08)" horizontal />
            <XAxis type="number" stroke="#475569" tick={{ fill: "#64748b", fontSize: 10 }} />
            <YAxis
              type="category"
              dataKey="stage"
              width={56}
              stroke="#475569"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
            />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(46,230,255,0.06)" }} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
              {pipeline.map((e) => (
                <Cell key={e.stage} fill={e.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </PanelFrame>

      <PanelFrame
        className="lg:col-span-7"
        fig="FIG 02 · THROUGHPUT"
        title="Closed items / week"
        subtitle="Velocity you can reason about — every transition is permission-checked and logged."
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={throughput} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="missionArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2ee6ff" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#2ee6ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,230,255,0.08)" />
            <XAxis dataKey="wk" stroke="#475569" tick={{ fill: "#64748b", fontSize: 10 }} />
            <YAxis stroke="#475569" tick={{ fill: "#64748b", fontSize: 10 }} width={28} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              type="monotone"
              dataKey="items"
              stroke="#2ee6ff"
              strokeWidth={2}
              fill="url(#missionArea)"
              dot={{ fill: "#2ee6ff", r: 3, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </PanelFrame>

      <PanelFrame
        className="sm:col-span-2 lg:col-span-7"
        fig="FIG 03 · COVERAGE"
        title="Platform depth (illustrative)"
        subtitle="What FlowCore optimizes for: structure, access control, and traceability — not sticky notes."
      >
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="52%" outerRadius="68%" data={capabilities}>
            <PolarGrid stroke="rgba(46,230,255,0.15)" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
            />
            <Radar
              name="Signal"
              dataKey="value"
              stroke="#ffb020"
              fill="#ffb020"
              fillOpacity={0.35}
              strokeWidth={1.5}
            />
            <Tooltip contentStyle={tooltipStyle} />
          </RadarChart>
        </ResponsiveContainer>
      </PanelFrame>

      <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-5">
        <div className="flex flex-1 flex-col justify-between rounded-lg border border-amber-500/20 bg-[rgba(8,14,28,0.72)] p-4 backdrop-blur-sm">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-400/90">
            TLM · STATUS
          </p>
          <div className="mt-3 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-slate-500">Events retained</span>
              <span className="font-mono text-lg text-slate-100 tabular-nums">100%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full w-full rounded-full bg-gradient-to-r from-amber-500/80 to-cyan-400/90 shadow-[0_0_12px_rgba(46,230,255,0.35)]"
                style={{ width: "100%" }}
              />
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Activity stream + item history — built for operational reviews and handoffs, not
              best-effort chat logs.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-cyan-500/15 bg-[rgba(6,10,20,0.65)] p-3 font-mono text-[10px] text-slate-400">
          <div>
            <p className="text-cyan-400/70">ORGS</p>
            <p className="mt-1 text-sm text-slate-200 tabular-nums">1+</p>
          </div>
          <div>
            <p className="text-cyan-400/70">CASES</p>
            <p className="mt-1 text-sm text-slate-200 tabular-nums">N</p>
          </div>
          <div>
            <p className="text-cyan-400/70">ITEMS</p>
            <p className="mt-1 text-sm text-slate-200 tabular-nums">∞</p>
          </div>
        </div>
      </div>
    </div>
  );
}
