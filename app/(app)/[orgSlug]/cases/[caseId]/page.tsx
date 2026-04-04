import { ActivityLog } from "@/components/activity-log";
import { CaseStatusBadge } from "@/components/case-status-badge";
import { CreateItemDialog } from "@/components/create-item-dialog";
import { DeleteCaseButton } from "@/components/delete-case-button";
import { EditCaseDialog } from "@/components/edit-case-dialog";
import { KanbanBoard } from "@/components/kanban-board";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getCurrentUserProfile } from "@/lib/auth";
import {
  fetchActivityForOrg,
  fetchCaseParticipants,
  fetchCommentsForCase,
} from "@/lib/db";
import { fetchItemsBoardBundle } from "@/lib/items-board-bundle";
import { withLatencyGuard } from "@/lib/latency-dev";
import { CaseParticipantsPanel } from "@/components/case-participants-panel";
import { CaseQuestionsPanel } from "@/components/case-questions-panel";
import { PageBackLink } from "@/components/page-back-link";
import { fetchCaseById } from "@/lib/cases";
import { fetchCaseQuestions } from "@/lib/case-questions";
import { getOrgMembershipBySlug } from "@/lib/organizations";
import { canDeleteCase, canEditCaseDetails } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatAccusedForDisplay } from "@/lib/case-accused";

type PageProps = {
  params: Promise<{ orgSlug: string; caseId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

function formatFinancial(n: number | string | null): string {
  if (n == null || n === "") return "—";
  const num = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default async function CaseDetailPage({ params, searchParams }: PageProps) {
  const { orgSlug, caseId } = await params;
  const { tab } = await searchParams;
  const activeTab = tab === "questions" ? "questions" : "overview";
  const [membership, profile] = await Promise.all([
    getOrgMembershipBySlug(orgSlug),
    getCurrentUserProfile(),
  ]);
  if (!membership || !profile) notFound();

  const orgId = membership.organization.id;
  const orgRole = membership.organization.role;

  const caseRow = await fetchCaseById(orgId, caseId);
  if (!caseRow) notFound();

  // Some parallel branches still chain extra queries internally (next P1: case-detail RPC).
  const [board, logs, comments, participants, caseQuestions] = await withLatencyGuard(
    "case-detail-fetch",
    () =>
      Promise.all([
        fetchItemsBoardBundle(orgId, caseId),
        fetchActivityForOrg(orgId, { limit: 200, filters: { caseId } }),
        fetchCommentsForCase(orgId, caseId),
        fetchCaseParticipants(orgId, caseId),
        activeTab === "questions" ? fetchCaseQuestions(orgId, caseId) : Promise.resolve([]),
      ])
  );

  const { items, users, cases: caseOptions } = board;
  const showDelete = canDeleteCase(orgRole);
  const isInternalCaseParticipant = participants.some(
    (p) => p.type === "internal" && p.user_id === profile.id
  );
  const canEditCase = canEditCaseDetails(orgRole, caseRow, profile.id, isInternalCaseParticipant);

  return (
    <div className="space-y-10 max-w-6xl">
      <PageBackLink href={`/${orgSlug}/cases`} label="Back to all cases" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CaseStatusBadge status={caseRow.status} />
            {caseRow.all_questions_answered ? (
              <Badge variant="secondary" className="text-xs">
                All case questions answered
              </Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">
              Created {new Date(caseRow.created_at).toLocaleString()}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{caseRow.title}</h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Case questions, people, and tasks for this matter live here. Use the tabs to switch
            between the overview and <strong className="text-foreground">Questions</strong>.
          </p>
          {(caseRow.district || caseRow.crime_number) && (
            <p className="text-sm text-muted-foreground mt-2">
              District / reference:{" "}
              {[caseRow.district, caseRow.crime_number].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <CreateItemDialog
            users={users}
            profile={profile}
            organizationId={orgId}
            orgSlug={orgSlug}
            orgRole={orgRole}
            cases={caseOptions}
            defaultCaseId={caseId}
          />
          {canEditCase ? (
            <EditCaseDialog
              organizationId={orgId}
              orgSlug={orgSlug}
              caseRow={caseRow}
              orgUsers={users}
              participants={participants}
            />
          ) : null}
          {showDelete && (
            <DeleteCaseButton
              organizationId={orgId}
              orgSlug={orgSlug}
              caseId={caseRow.id}
              caseTitle={caseRow.title}
            />
          )}
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-border/80 pb-2">
        <Link
          href={`/${orgSlug}/cases/${caseId}`}
          className={cn(
            "inline-flex min-h-10 touch-manipulation items-center rounded-md px-3 text-sm font-medium transition-colors",
            activeTab === "overview"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Overview
        </Link>
        <Link
          href={`/${orgSlug}/cases/${caseId}?tab=questions`}
          className={cn(
            "inline-flex min-h-10 touch-manipulation items-center rounded-md px-3 text-sm font-medium transition-colors",
            activeTab === "questions"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Questions
        </Link>
      </nav>

      {activeTab === "questions" ? (
        <CaseQuestionsPanel
          organizationId={orgId}
          orgSlug={orgSlug}
          caseId={caseId}
          participants={participants}
          questions={caseQuestions}
          currentUserId={profile.id}
        />
      ) : null}

      {activeTab === "overview" ? (
        <>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Summary</h2>
        <Card>
          <CardContent className="pt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                What we know so far
              </p>
              <p className="text-sm mt-1 whitespace-pre-wrap">
                {caseRow.description?.trim() ? caseRow.description : "—"}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Accused details
              </p>
              <pre className="text-sm mt-2 rounded-lg border border-border/80 bg-muted/30 p-3 overflow-x-auto whitespace-pre-wrap font-sans">
                {formatAccusedForDisplay(caseRow.accused)}
              </pre>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Amount involved
              </p>
              <p className="text-sm mt-1 tabular-nums">{formatFinancial(caseRow.financial_impact)}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <CaseParticipantsPanel
          organizationId={orgId}
          orgSlug={orgSlug}
          caseId={caseRow.id}
          caseTitle={caseRow.title?.trim() ? caseRow.title : "Case"}
          orgName={membership.organization.name?.trim() ? membership.organization.name : orgSlug}
          participants={participants}
          orgUsers={users}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Tasks</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Same Kanban as Items — filtered to this case.
          </p>
        </div>
        <KanbanBoard
          items={items}
          users={users}
          caseParticipants={participants}
          orgRole={orgRole}
          organizationId={orgId}
          orgSlug={orgSlug}
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Discussion from tasks</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">From linked tasks</CardTitle>
            <CardDescription>
              Notes are stored on each task; this list aggregates them for the case timeline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No comments on tasks in this case yet. Open a task to add an update.
              </p>
            ) : (
              <ul className="space-y-4">
                {comments.map((c) => (
                  <li key={c.id} className="border-b border-border/60 pb-4 last:border-0 last:pb-0">
                    <p className="text-sm whitespace-pre-wrap">{c.text}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      <Link
                        href={`/${orgSlug}/items/${c.item_id}`}
                        className="text-primary underline-offset-4 hover:underline font-medium"
                      >
                        {c.itemTitle}
                      </Link>
                      {" · "}
                      {c.user?.name ?? c.user?.email ?? "Unknown"}
                      {" · "}
                      {new Date(c.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Activity</h2>
        <ActivityLog entries={logs} />
      </section>
        </>
      ) : null}
    </div>
  );
}
