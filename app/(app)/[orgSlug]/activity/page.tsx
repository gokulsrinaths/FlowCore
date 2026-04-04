import { ActivityLog } from "@/components/activity-log";
import { PageBackLink } from "@/components/page-back-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchActivityForOrg, fetchOrgSystemAuditLogs } from "@/lib/db";
import { getOrgMembershipBySlug } from "@/lib/organizations";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ orgSlug: string }> };

export default async function ActivityPage({ params }: PageProps) {
  const { orgSlug } = await params;
  const membership = await getOrgMembershipBySlug(orgSlug);
  if (!membership) notFound();

  const orgId = membership.organization.id;
  const [feed, system] = await Promise.all([
    fetchActivityForOrg(orgId, { limit: 200 }),
    fetchOrgSystemAuditLogs(orgId, 40),
  ]);

  return (
    <div className="space-y-8">
      <PageBackLink href={`/${orgSlug}/dashboard`} label="Back to dashboard" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Organization-scoped audit trail and system events.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow & item events</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityLog entries={feed} />
        </CardContent>
      </Card>

      {(membership.organization.role === "org_owner" ||
        membership.organization.role === "org_admin") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">System audit</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityLog entries={system} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
