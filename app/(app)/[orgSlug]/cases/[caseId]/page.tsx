import { ActivityLog } from "@/components/activity-log";
import { CaseStatusBadge } from "@/components/case-status-badge";
import { CreateItemDialog } from "@/components/create-item-dialog";
import { DeleteCaseButton } from "@/components/delete-case-button";
import { EditCaseDialog } from "@/components/edit-case-dialog";
import { KanbanBoard } from "@/components/kanban-board";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getCurrentUserProfile } from "@/lib/auth";
import {
  fetchActivityForOrg,
  fetchCaseParticipants,
  fetchCommentsForCase,
  fetchItemsWithUsers,
  fetchUsersForOrg,
} from "@/lib/db";
import { CaseParticipantsPanel } from "@/components/case-participants-panel";
import { fetchCaseById, fetchCasesForOrg } from "@/lib/cases";
import { getOrgMembershipBySlug } from "@/lib/organizations";
import { canDeleteCase } from "@/lib/permissions";
import Link from "next/link";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ orgSlug: string; caseId: string }> };

function formatAccused(accused: unknown): string {
  if (accused == null) return "—";
  if (typeof accused === "string") return accused;
  try {
    return JSON.stringify(accused, null, 2);
  } catch {
    return String(accused);
  }
}

function formatFinancial(n: number | string | null): string {
  if (n == null || n === "") return "—";
  const num = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default async function CaseDetailPage({ params }: PageProps) {
  const { orgSlug, caseId } = await params;
  const [membership, profile] = await Promise.all([
    getOrgMembershipBySlug(orgSlug),
    getCurrentUserProfile(),
  ]);
  if (!membership || !profile) notFound();

  const orgId = membership.organization.id;
  const orgRole = membership.organization.role;

  const caseRow = await fetchCaseById(orgId, caseId);
  if (!caseRow) notFound();

  const [items, users, logs, comments, allCases, participants] = await Promise.all([
    fetchItemsWithUsers(orgId, { caseId }),
    fetchUsersForOrg(orgId),
    fetchActivityForOrg(orgId, { limit: 200, filters: { caseId } }),
    fetchCommentsForCase(orgId, caseId),
    fetchCasesForOrg(orgId),
    fetchCaseParticipants(orgId, caseId),
  ]);

  const caseOptions = allCases.map((c) => ({ id: c.id, title: c.title }));
  const showDelete = canDeleteCase(orgRole);

  return (
    <div className="space-y-10 max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CaseStatusBadge status={caseRow.status} />
            <span className="text-xs text-muted-foreground">
              Created {new Date(caseRow.created_at).toLocaleString()}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{caseRow.title}</h1>
          {caseRow.crime_number && (
            <p className="text-sm text-muted-foreground">Reference: {caseRow.crime_number}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <CreateItemDialog
            users={users}
            profile={profile}
            organizationId={orgId}
            orgSlug={orgSlug}
            orgRole={orgRole}
            cases={caseOptions}
            defaultCaseId={caseId}
          />
          <EditCaseDialog organizationId={orgId} orgSlug={orgSlug} caseRow={caseRow} />
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

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Case info</h2>
        <Card>
          <CardContent className="pt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Description</p>
              <p className="text-sm mt-1 whitespace-pre-wrap">
                {caseRow.description?.trim() ? caseRow.description : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Financial impact
              </p>
              <p className="text-sm mt-1 tabular-nums">{formatFinancial(caseRow.financial_impact)}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Accused / parties (JSON)
              </p>
              <pre className="text-sm mt-2 rounded-lg border border-border/80 bg-muted/30 p-3 overflow-x-auto whitespace-pre-wrap font-mono">
                {formatAccused(caseRow.accused)}
              </pre>
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
        <h2 className="text-lg font-medium">Comments & notes</h2>
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
                No comments on tasks in this case yet. Open a task to add notes.
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
    </div>
  );
}
