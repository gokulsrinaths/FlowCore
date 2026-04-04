import { ActivityLog } from "@/components/activity-log";
import { CommentSection } from "@/components/comment-section";
import { ItemCaseLink } from "@/components/item-case-link";
import { ItemDetailActions } from "@/components/item-detail-actions";
import { ItemDetailControls } from "@/components/item-detail-controls";
import { ItemQuestionnairesPanel } from "@/components/item-questionnaires-panel";
import { PageBackLink } from "@/components/page-back-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getCurrentUserProfile } from "@/lib/auth";
import { fetchCasesForOrg } from "@/lib/cases";
import {
  fetchActivityForItem,
  fetchCaseParticipants,
  fetchCommentsForItem,
  fetchItemById,
  fetchUsersForOrg,
} from "@/lib/db";
import { fetchItemQuestionnaires } from "@/lib/item-questionnaires";
import { getOrgMembershipBySlug } from "@/lib/organizations";
import { canDeleteItem, canEditItem, STATUS_LABELS } from "@/lib/permissions";
import Link from "next/link";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ orgSlug: string; id: string }> };

export default async function ItemDetailPage({ params }: PageProps) {
  const { orgSlug, id } = await params;
  const membership = await getOrgMembershipBySlug(orgSlug);
  const profile = await getCurrentUserProfile();
  if (!membership || !profile) notFound();

  const orgId = membership.organization.id;
  const orgRole = membership.organization.role;

  const [item, users, logs, comments, cases, questionnaires] = await Promise.all([
    fetchItemById(orgId, id),
    fetchUsersForOrg(orgId),
    fetchActivityForItem(orgId, id),
    fetchCommentsForItem(orgId, id),
    fetchCasesForOrg(orgId),
    fetchItemQuestionnaires(orgId, id),
  ]);

  if (!item) {
    notFound();
  }

  const linkedCase = item.case_id
    ? cases.find((c) => c.id === item.case_id) ?? null
    : null;
  const caseOptions = cases.map((c) => ({ id: c.id, title: c.title }));

  const caseParticipants = item.case_id
    ? await fetchCaseParticipants(orgId, item.case_id)
    : [];

  const canEdit = canEditItem(orgRole, item, profile.id);
  const canDelete = canDeleteItem(orgRole, item, profile.id);

  return (
    <div className="space-y-8 max-w-3xl">
      <PageBackLink href={`/${orgSlug}/items`} label="Back to items" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {STATUS_LABELS[item.status]}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">{item.title}</h1>
          <p className="text-muted-foreground text-sm mt-2 whitespace-pre-wrap">
            {item.description ?? "No description."}
          </p>
        </div>
        {(canEdit || canDelete) && (
          <ItemDetailActions
            item={item}
            canEdit={canEdit}
            canDelete={canDelete}
            organizationId={orgId}
            orgSlug={orgSlug}
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemDetailControls
            item={item}
            orgRole={orgRole}
            users={users}
            caseParticipants={caseParticipants}
            organizationId={orgId}
            orgSlug={orgSlug}
            canEditDueDate={canEdit}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Questionnaires</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemQuestionnairesPanel
            rows={questionnaires}
            users={users}
            organizationId={orgId}
            orgSlug={orgSlug}
            item={item}
            orgRole={orgRole}
            currentUserId={profile.id}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Case</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {linkedCase ? (
            <p className="text-sm">
              Linked to{" "}
              <Link
                href={`/${orgSlug}/cases/${linkedCase.id}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {linkedCase.title}
              </Link>
              {linkedCase.crime_number ? (
                <span className="text-muted-foreground"> · {linkedCase.crime_number}</span>
              ) : null}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Not linked to a case.</p>
          )}
          <ItemCaseLink
            organizationId={orgId}
            orgSlug={orgSlug}
            itemId={item.id}
            cases={caseOptions}
            currentCaseId={item.case_id ?? null}
          />
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-medium mb-3">Comments</h2>
        <CommentSection
          itemId={item.id}
          organizationId={orgId}
          orgSlug={orgSlug}
          initialComments={comments}
          currentUserId={profile.id}
        />
      </div>

      <Separator />

      <div>
        <h2 className="text-lg font-medium mb-3">Activity</h2>
        <ActivityLog entries={logs} />
      </div>
    </div>
  );
}
