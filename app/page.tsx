import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

export default function MarketingHome() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/80 bg-card/50 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <span className="font-semibold tracking-tight">FlowCore</span>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/pricing" className="text-muted-foreground hover:text-foreground">
              Pricing
            </Link>
            <Link href="/help" className="text-muted-foreground hover:text-foreground">
              Help
            </Link>
            <Link href="/login" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
              Sign in
            </Link>
            <Link
              href="/login?signup=1"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="max-w-2xl space-y-6">
            <p className="text-sm font-medium text-primary">Workflow operating system</p>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-balance">
              Structured team operations, without the spreadsheet chaos.
            </h1>
            <p className="text-lg text-muted-foreground text-pretty">
              FlowCore is a workflow OS for teams that need clear stages, role-based handoffs,
              and an audit trail — Kanban, comments, and permissions enforced in the database.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/login" className={cn(buttonVariants({ size: "lg" }))}>
                Start for free
              </Link>
              <Link href="/pricing" className={cn(buttonVariants({ size: "lg", variant: "outline" }))}>
                See pricing
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-border/60 bg-muted/20 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-2xl font-semibold mb-8">How it works</h2>
            <ol className="grid gap-6 sm:grid-cols-3 text-sm">
              <li className="rounded-xl border border-border/80 bg-card p-5 space-y-2">
                <span className="text-xs font-medium text-primary">1</span>
                <p className="font-medium">Create a workspace</p>
                <p className="text-muted-foreground">
                  Invite your team; everyone gets org-scoped roles.
                </p>
              </li>
              <li className="rounded-xl border border-border/80 bg-card p-5 space-y-2">
                <span className="text-xs font-medium text-primary">2</span>
                <p className="font-medium">Run items through stages</p>
                <p className="text-muted-foreground">
                  Created → In progress → Under review → Completed, with strict transitions.
                </p>
              </li>
              <li className="rounded-xl border border-border/80 bg-card p-5 space-y-2">
                <span className="text-xs font-medium text-primary">3</span>
                <p className="font-medium">Trust the audit trail</p>
                <p className="text-muted-foreground">
                  Every change is logged — built for operational accountability.
                </p>
              </li>
            </ol>
          </div>
        </section>

        <section className="py-16 mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-2xl font-semibold mb-6">Built for</h2>
          <ul className="grid sm:grid-cols-2 gap-4 text-sm text-muted-foreground">
            <li className="rounded-lg border border-dashed border-border/80 p-4">
              Ops & intake teams routing requests through review.
            </li>
            <li className="rounded-lg border border-dashed border-border/80 p-4">
              Agencies coordinating delivery without losing context.
            </li>
            <li className="rounded-lg border border-dashed border-border/80 p-4">
              Internal compliance-style queues with clear ownership.
            </li>
            <li className="rounded-lg border border-dashed border-border/80 p-4">
              Any team that outgrew shared inboxes and static task lists.
            </li>
          </ul>
        </section>
      </main>
      <footer className="border-t border-border/80 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} FlowCore ·{" "}
        <Link href="/login" className="underline-offset-4 hover:underline">
          Sign in
        </Link>
        {" · "}
        <Link href="/login?signup=1" className="underline-offset-4 hover:underline">
          Create account
        </Link>
        {" · "}
        <Link href="/help" className="underline-offset-4 hover:underline">
          Help
        </Link>
      </footer>
    </div>
  );
}
