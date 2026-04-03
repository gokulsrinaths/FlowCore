import Link from "next/link";

export default function HelpPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/80 bg-card/50">
        <div className="mx-auto max-w-3xl flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center font-semibold tracking-tight touch-manipulation"
          >
            FlowCore
          </Link>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center text-primary hover:underline touch-manipulation"
            >
              Sign in
            </Link>
            <Link
              href="/login?signup=1"
              className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground touch-manipulation"
            >
              Create account
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 mx-auto max-w-3xl px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12 space-y-8 sm:space-y-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Help & docs</h1>
          <p className="text-muted-foreground mt-2">
            Quick answers for getting started with FlowCore.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Getting started</h2>
          <p className="text-sm text-muted-foreground text-pretty">
            After you sign up, create a workspace from onboarding. You’ll land in the dashboard,
            then open <strong>Items</strong> to use the Kanban board. Each card is an{" "}
            <strong>item</strong> moving through workflow stages.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Invite your team</h2>
          <p className="text-sm text-muted-foreground text-pretty">
            Go to <strong>Team</strong> in the sidebar (under Settings). Owners and admins can
            invite by email with a role. Invited users must sign in with the same email address
            to accept from the invite link.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Workflow basics</h2>
          <p className="text-sm text-muted-foreground text-pretty">
            Items flow: <strong>Created</strong> → <strong>In progress</strong> →{" "}
            <strong>Under review</strong> → <strong>Completed</strong>. Transitions depend on your
            role: workers advance early stages; managers complete or send back from review; owners
            and admins can override when needed.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Permissions</h2>
          <p className="text-sm text-muted-foreground text-pretty">
            <strong>Owner / Admin</strong> manage the workspace, billing (when enabled), and
            invitations. <strong>Manager</strong> can assign work and finish review stages.{" "}
            <strong>Worker</strong> focuses on assigned or created items. All changes are
            reflected in the Activity feed.
          </p>
        </section>
      </main>
    </div>
  );
}
