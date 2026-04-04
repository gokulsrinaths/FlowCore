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
import {
  countAssignedToUser,
  countItemsByAssignee,
  countItemsByStatus,
  fetchActivityForOrg,
} from "@/lib/db";
import { fetchMyUnlockedCaseQuestions } from "@/lib/case-questions";
import { countCasesForOrg, fetchRecentCasesForOrg } from "@/lib/cases";
import { getCurrentUserProfile } from "@/lib/auth";
import { fetchSubscription, getOrgMembershipBySlug } from "@/lib/organizations";
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
  userId,
}: {
  orgSlug: string;
  organizationId: string;
  userId: string;
}) {
  const [counts, assigned, workload, recent, sub, caseCounts, recentCases, myCaseQuestions] =
    await Promise.all([
      countItemsByStatus(organizationId),
      countAssignedToUser(organizationId, userId),
      countItemsByAssignee(organizationId),
      fetchActivityForOrg(organizationId, { limit: 8 }),
      fetchSubscription(organizationId),
      countCasesForOrg(organizationId),
      fetchRecentCasesForOrg(organizationId, 5),
      fetchMyUnlockedCaseQuestions(organizationId),
    ]);

  const total = STATUS_ORDER.reduce((acc, s) => acc + counts[s], 0);
  const base = `/${orgSlug}`;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Workspace
          </p>
          <h2 className="text-lg font-semibold mt-1">Overview</h2>
          <p className="text-sm text-muted-foreground mt-1">
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
            Cases
          </Link>
          <Link
            href={`${base}/items`}
            className={cn(buttonVariants({ size: "sm" }), "w-full justify-center sm:w-auto")}
          >
            Open items board
          </Link>
          {myCaseQuestions.length > 0 ? (
            <Link
              href="#dashboard-your-questions"
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "w-full justify-center sm:w-auto"
              )}
            >
              Your questions ({myCaseQuestions.length})
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Assigned to you
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{assigned}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total cases
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{caseCounts.total}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {caseCounts.active} active (not closed)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{total}</p>
            {total === 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Your workspace is empty — create demo items to explore the workflow.
                </p>
                <DemoDataButton organizationId={organizationId} orgSlug={orgSlug} />
              </div>
            )}
          </CardContent>
        </Card>
        {STATUS_ORDER.map((status: ItemStatus) => (
          <Card key={status}>
            <CardHeader className="pb-2">
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

      {caseCounts.total === 0 && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">No cases yet</CardTitle>
            <CardDescription>
              Case files group tasks, participants, and structured questions. Create one to start an
              investigation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={`${base}/cases`}
              className={cn(buttonVariants(), "inline-flex w-full justify-center sm:w-auto")}
            >
              Go to cases
            </Link>
          </CardContent>
        </Card>
      )}

      {recentCases.length > 0 && (
        <Card>
          <CardHeader className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <CardTitle className="text-base">Recent cases</CardTitle>
              <CardDescription>Latest case files in this workspace</CardDescription>
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
          <CardContent>
            <ul className="space-y-3">
              {recentCases.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team workload</CardTitle>
            <CardDescription>Open assignments by teammate</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {workload.slice(0, 8).map((w) => (
              <span
                key={w.userId}
                className="rounded-full border border-border/80 px-3 py-1 text-sm bg-muted/30"
              >
                {w.count} open
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      {myCaseQuestions.length > 0 ? (
        <Card id="dashboard-your-questions" className="scroll-mt-24 border-primary/20">
          <CardHeader>
            <CardTitle className="text-base">Your questions</CardTitle>
            <CardDescription>
              Assigned to you and unlocked (all dependencies answered). Open each case and use the
              Questions tab to respond.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {myCaseQuestions.map((q) => (
                <li key={q.id} className="border-border/60 border-b pb-3 last:border-0 last:pb-0">
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

      <Card>
        <CardHeader className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>Latest changes in this workspace</CardDescription>
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
        <CardContent className="space-y-3">
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recent.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
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

      <Card className="border-primary/15 bg-muted/30">
        <CardHeader>
          <CardTitle className="text-base">Where your workflow lives</CardTitle>
          <CardDescription className="text-pretty">
            Items move through <strong>Created</strong> → <strong>In progress</strong> →{" "}
            <strong>Under review</strong> → <strong>Completed</strong>. Use the board to
            drag cards or change status from each card.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function StatsLoading() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {membership.organization.name}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Dashboard · snapshot of work in this workspace.
        </p>
      </div>
      <Suspense fallback={<StatsLoading />}>
        <Stats
          orgSlug={orgSlug}
          organizationId={membership.organization.id}
          userId={profile.id}
        />
      </Suspense>
    </div>
  );
}
