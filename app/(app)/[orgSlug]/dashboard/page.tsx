import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUserProfile } from "@/lib/auth";
import { fetchDashboardSnapshot } from "@/lib/dashboard-snapshot";
import { withLatencyGuard } from "@/lib/latency-dev";
import { getOrgMembershipBySlug } from "@/lib/organizations";
import { planDisplayName } from "@/lib/billing";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/permissions";
import type { ItemStatus } from "@/types";
import { CaseStatusBadge } from "@/components/case-status-badge";
import { DemoDataButton } from "@/components/demo-data-button";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ orgSlug: string }> };

async function Stats({
  orgSlug,
  organizationId,
}: {
  orgSlug: string;
  organizationId: string;
}) {
  const snap = await withLatencyGuard(
    "dashboard-fetch",
    () => fetchDashboardSnapshot(organizationId),
    { backendRoundTrips: 1 }
  );

  const counts = snap.countsByStatus;
  const assigned = snap.assignedToMe;
  const workload = snap.workload;
  const recent = snap.recentActivity;
  const sub = snap.subscription;
  const caseCounts = snap.caseCounts;
  const recentCases = snap.recentCases;
  const myCaseQuestions = snap.myCaseQuestions;

  const total = STATUS_ORDER.reduce((acc, s) => acc + counts[s], 0);
  const base = `/${orgSlug}`;
  const emptyWorkspace = caseCounts.total === 0 && total === 0;

  return (
    <div className="space-y-3">
      {emptyWorkspace ? (
        <Card className="border-primary/20 bg-muted/25">
          <CardHeader className="gap-1 pb-2">
            <CardTitle className="text-base">Welcome — start here</CardTitle>
            <CardDescription className="text-pretty">
              FlowCore helps your team track <strong className="text-foreground">cases</strong>{" "}
              (a folder of related work) and <strong className="text-foreground">tasks</strong> on a
              simple board. Create a case first, or jump to tasks if you already know what to do.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-0 sm:flex-row sm:flex-wrap">
            <Link
              href={`${base}/cases`}
              className={cn(buttonVariants({ size: "default" }), "w-full justify-center sm:w-auto")}
            >
              Create your first case
            </Link>
            <Link
              href={`${base}/items`}
              className={cn(
                buttonVariants({ variant: "outline", size: "default" }),
                "w-full justify-center sm:w-auto"
              )}
            >
              Open the task board
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Workspace
          </p>
          <h2 className="text-lg font-semibold mt-0.5">Overview</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Plan:{" "}
            <span className="text-foreground font-medium">
              {planDisplayName((sub?.plan as "free") ?? "free")}
            </span>
            {sub?.plan === "free" && (
              <>
                {" · "}
                <Link
                  href={`${base}/settings/billing`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Upgrade
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link
            href={`${base}/cases`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "w-full justify-center sm:w-auto"
            )}
          >
            All cases
          </Link>
          <Link
            href={`${base}/items`}
            className={cn(buttonVariants({ size: "sm" }), "w-full justify-center sm:w-auto")}
          >
            Task board
          </Link>
          {myCaseQuestions.length > 0 ? (
            <Link
              href="#dashboard-your-questions"
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "w-full justify-center sm:w-auto"
              )}
            >
              Answer questions ({myCaseQuestions.length})
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <Card size="sm" className="border-dashed">
          <CardHeader className="pb-1.5 pt-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Your tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{assigned}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader className="pb-1.5 pt-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cases
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{caseCounts.total}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {caseCounts.active} not finished yet
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader className="pb-1.5 pt-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              All tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{total}</p>
            {total === 0 && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted-foreground">
                  No tasks yet — add sample tasks to see how the board works.
                </p>
                <DemoDataButton organizationId={organizationId} orgSlug={orgSlug} />
              </div>
            )}
          </CardContent>
        </Card>
        {STATUS_ORDER.map((status: ItemStatus) => (
          <Card size="sm" key={status}>
            <CardHeader className="pb-1.5 pt-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {STATUS_LABELS[status]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{counts[status]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {caseCounts.total === 0 && !emptyWorkspace ? (
        <Card size="sm" className="border-dashed">
          <CardHeader className="gap-0.5 pb-2">
            <CardTitle className="text-base">No cases yet</CardTitle>
            <CardDescription>
              A case groups tasks, people, and follow-up questions. Add one when you are ready to
              organize work around a topic.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={`${base}/cases`}
              className={cn(buttonVariants(), "inline-flex w-full justify-center sm:w-auto")}
            >
              Create a case
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {recentCases.length > 0 && (
        <Card size="sm">
          <CardHeader className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 pb-2">
            <div>
              <CardTitle className="text-base">Recent cases</CardTitle>
              <CardDescription>Cases updated lately in this workspace</CardDescription>
            </div>
            <Link
              href={`${base}/cases`}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "w-full justify-center sm:w-auto"
              )}
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1.5">
              {recentCases.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-1.5 text-sm"
                >
                  <Link
                    href={`${base}/cases/${c.id}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {c.title}
                  </Link>
                  <CaseStatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {workload.length > 0 && (
        <Card size="sm">
          <CardHeader className="gap-0.5 pb-2">
            <CardTitle className="text-base">Who has what</CardTitle>
            <CardDescription>Open tasks per person</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5 pt-0">
            {workload.slice(0, 8).map((w) => (
              <span
                key={w.userId}
                className="rounded-full border border-border/80 px-2.5 py-0.5 text-sm bg-muted/30"
              >
                {w.count} open task{w.count === 1 ? "" : "s"}
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      {myCaseQuestions.length > 0 ? (
        <Card
          size="sm"
          id="dashboard-your-questions"
          className="scroll-mt-16 border-primary/20"
        >
          <CardHeader className="gap-0.5 pb-2">
            <CardTitle className="text-base">Questions for you</CardTitle>
            <CardDescription>
              These are ready for you to answer. Open the case and use the Questions tab.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2 text-sm">
              {myCaseQuestions.map((q) => (
                <li key={q.id} className="border-border/60 border-b pb-2 last:border-0 last:pb-0">
                  <Link
                    href={`${base}/cases/${q.case_id}?tab=questions`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {q.case_title}
                  </Link>
                  <p className="text-foreground mt-1">{q.question_text}</p>
                  {q.description ? (
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{q.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card size="sm">
        <CardHeader className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 pb-2">
          <div>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>What changed lately</CardDescription>
          </div>
          <Link
            href={`${base}/activity`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "w-full justify-center sm:w-auto"
            )}
          >
            View all
          </Link>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing here yet — activity will show up as your team works.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {recent.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-3">
                  <span className="min-w-0 text-muted-foreground">
                    <span className="text-foreground font-medium">{a.action}</span>
                    {a.user?.name && ` · ${a.user.name}`}
                  </span>
                  <span className="text-xs text-muted-foreground sm:shrink-0">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card size="sm" className="border-primary/15 bg-muted/30">
        <CardHeader className="gap-0.5 pb-2">
          <CardTitle className="text-base">How tasks move</CardTitle>
          <CardDescription className="text-pretty">
            Tasks flow{" "}
            <strong>{STATUS_LABELS.created}</strong> → <strong>{STATUS_LABELS.in_progress}</strong>{" "}
            → <strong>{STATUS_LABELS.under_review}</strong> →{" "}
            <strong>{STATUS_LABELS.completed}</strong>. Drag cards on the board or change status on
            each card.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function StatsLoading() {
  return (
    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}

export default async function DashboardPage({ params }: PageProps) {
  const { orgSlug } = await params;
  const [membership, profile] = await Promise.all([
    getOrgMembershipBySlug(orgSlug),
    getCurrentUserProfile(),
  ]);
  if (!membership || !profile) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {membership.organization.name}
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          See cases, tasks, and what needs attention — all in one place.
        </p>
      </div>
      <Suspense fallback={<StatsLoading />}>
        <Stats orgSlug={orgSlug} organizationId={membership.organization.id} />
      </Suspense>
    </div>
  );
}
