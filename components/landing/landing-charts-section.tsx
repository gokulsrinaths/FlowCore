"use client";

import dynamic from "next/dynamic";

const MissionDashboard = dynamic(
  () =>
    import("@/components/landing/mission-dashboard").then((m) => ({
      default: m.MissionDashboard,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        className="grid min-h-[28rem] animate-pulse gap-4 rounded-lg border border-cyan-500/15 bg-[rgba(6,12,24,0.4)] sm:grid-cols-2 lg:grid-cols-12"
        aria-hidden
      >
        <div className="h-52 rounded-lg bg-cyan-500/5 sm:col-span-2 lg:col-span-5" />
        <div className="h-52 rounded-lg bg-cyan-500/5 sm:col-span-2 lg:col-span-7" />
        <div className="h-52 rounded-lg bg-cyan-500/5 sm:col-span-2 lg:col-span-7" />
        <div className="h-52 rounded-lg bg-cyan-500/5 sm:col-span-2 lg:col-span-5" />
      </div>
    ),
  }
);

export function LandingChartsSection() {
  return (
    <div>
      <p className="mb-3 text-[10px] uppercase tracking-[0.25em] text-slate-500 [font-family:var(--landing-mono),ui-monospace,monospace]">
        Ground segment · live telemetry (illustrative)
      </p>
      <MissionDashboard />
    </div>
  );
}
