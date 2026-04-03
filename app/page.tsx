import Link from "next/link";
import { IBM_Plex_Mono, Outfit } from "next/font/google";
import { LandingChartsSection } from "@/components/landing/landing-charts-section";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

const display = Outfit({
  subsets: ["latin"],
  variable: "--landing-display",
});

const telemetry = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--landing-mono",
});

export default function MarketingHome() {
  return (
    <div
      className={cn(
        display.variable,
        telemetry.variable,
        "min-h-screen flex flex-col bg-[#030508] text-slate-200 antialiased",
        "[font-family:var(--landing-display),system-ui,sans-serif]"
      )}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(46,230,255,0.12),transparent_50%),radial-gradient(ellipse_80%_50%_at_100%_50%,rgba(255,176,32,0.06),transparent_45%)]" />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <header className="relative z-10 border-b border-cyan-500/10 bg-[rgba(3,5,8,0.75)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-4">
          <span className="font-medium tracking-tight text-slate-100">
            Flow<span className="text-cyan-400">Core</span>
          </span>
          <nav className="flex flex-wrap items-center gap-2 text-sm sm:gap-3">
            <Link
              href="/pricing"
              className="inline-flex min-h-11 items-center text-slate-400 transition-colors hover:text-cyan-300 touch-manipulation"
            >
              Pricing
            </Link>
            <Link
              href="/help"
              className="inline-flex min-h-11 items-center text-slate-400 transition-colors hover:text-cyan-300 touch-manipulation"
            >
              Help
            </Link>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "w-full justify-center border-cyan-500/30 bg-transparent text-slate-200 hover:bg-cyan-500/10 hover:text-cyan-200 sm:w-auto"
              )}
            >
              Sign in
            </Link>
            <Link
              href="/login?signup=1"
              className={cn(
                buttonVariants({ size: "sm" }),
                "w-full justify-center bg-cyan-500 text-[#030508] shadow-[0_0_24px_rgba(46,230,255,0.25)] hover:bg-cyan-400 sm:w-auto"
              )}
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:pt-20">
          <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-10">
            <div className="space-y-8 lg:col-span-5">
              <div className="space-y-2">
                <p
                  className={cn(
                    "text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400/90",
                    "[font-family:var(--landing-mono),ui-monospace,monospace]"
                  )}
                >
                  Workflow flight software
                </p>
                <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-balance text-white sm:text-5xl lg:text-[2.75rem]">
                  Operate at mission tempo.{" "}
                  <span className="bg-gradient-to-r from-cyan-300 to-cyan-500 bg-clip-text text-transparent">
                    Full traceability.
                  </span>
                </h1>
              </div>
              <p className="max-w-md text-base leading-relaxed text-slate-400 text-pretty">
                FlowCore is a workflow OS: <strong className="font-medium text-slate-300">cases</strong>,{" "}
                <strong className="font-medium text-slate-300">Kanban stages</strong>,{" "}
                <strong className="font-medium text-slate-300">role-based access</strong>, and an{" "}
                <strong className="font-medium text-slate-300">audit trail</strong> enforced in the
                database — so your team sees the same truth, instantly.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/login?signup=1"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "bg-cyan-500 px-8 text-[#030508] shadow-[0_0_32px_rgba(46,230,255,0.2)] hover:bg-cyan-400"
                  )}
                >
                  Initialize workspace
                </Link>
                <Link
                  href="/pricing"
                  className={cn(
                    buttonVariants({ size: "lg", variant: "outline" }),
                    "border-cyan-500/35 bg-transparent text-slate-200 hover:bg-cyan-500/10 hover:text-cyan-200"
                  )}
                >
                  Mission brief (pricing)
                </Link>
              </div>
              <dl
                className={cn(
                  "grid grid-cols-2 gap-4 border-t border-cyan-500/10 pt-8 sm:grid-cols-3",
                  "[font-family:var(--landing-mono),ui-monospace,monospace]"
                )}
              >
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500">Handoffs</dt>
                  <dd className="mt-1 text-lg font-medium tabular-nums text-cyan-300">Defined</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500">Permissions</dt>
                  <dd className="mt-1 text-lg font-medium tabular-nums text-amber-300/90">Enforced</dd>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500">Audit</dt>
                  <dd className="mt-1 text-lg font-medium tabular-nums text-emerald-400/90">Continuous</dd>
                </div>
              </dl>
            </div>

            <div className="lg:col-span-7">
              <LandingChartsSection />
            </div>
          </div>
        </section>

        <section className="border-y border-cyan-500/10 bg-[rgba(5,10,20,0.5)] py-14 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-500/80">
              Sequence of operations
            </h2>
            <p className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-white">
              How it works — three burns, no drift.
            </p>
            <ol className="mt-10 grid gap-5 sm:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Provision workspace",
                  body: "Create an org, invite operators. Roles are scoped — owners, admins, managers, workers.",
                },
                {
                  step: "02",
                  title: "Run the pipeline",
                  body: "Items move through enforced stages with clear ownership. Cases group related work.",
                },
                {
                  step: "03",
                  title: "Review the log",
                  body: "Every meaningful change leaves a trail — ready for stand-ups and compliance-style reviews.",
                },
              ].map((item) => (
                <li
                  key={item.step}
                  className="relative rounded-xl border border-cyan-500/15 bg-[rgba(6,12,24,0.65)] p-5 shadow-[inset_0_1px_0_rgba(46,230,255,0.05)]"
                >
                  <span
                    className={cn(
                      "text-[10px] font-medium text-cyan-400",
                      "[font-family:var(--landing-mono),ui-monospace,monospace]"
                    )}
                  >
                    SEQ {item.step}
                  </span>
                  <p className="mt-2 font-medium text-slate-100">{item.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Deployment profiles
          </h2>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white">Built for</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              "Operations & intake teams routing requests through structured review.",
              "Agencies coordinating delivery without losing thread across handoffs.",
              "Internal compliance-style queues with clear ownership and history.",
              "Any team that outgrew shared inboxes and static task spreadsheets.",
            ].map((text) => (
              <li
                key={text}
                className="rounded-lg border border-dashed border-cyan-500/20 bg-[rgba(5,10,18,0.4)] px-4 py-3 text-sm leading-relaxed text-slate-400"
              >
                {text}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="relative z-10 border-t border-cyan-500/10 bg-[rgba(3,5,8,0.9)] py-8 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} FlowCore ·{" "}
        <Link href="/login" className="text-cyan-500/80 underline-offset-4 hover:text-cyan-400 hover:underline">
          Sign in
        </Link>
        {" · "}
        <Link
          href="/login?signup=1"
          className="text-cyan-500/80 underline-offset-4 hover:text-cyan-400 hover:underline"
        >
          Create account
        </Link>
        {" · "}
        <Link href="/help" className="text-cyan-500/80 underline-offset-4 hover:text-cyan-400 hover:underline">
          Help
        </Link>
      </footer>
    </div>
  );
}
