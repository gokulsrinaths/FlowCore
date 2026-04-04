import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsSubnav } from "@/components/settings-subnav";
import { TeamMembersTable } from "@/components/team-members-table";
import { InviteForm } from "@/components/invite-form";
import {
  fetchOrgMembers,
  fetchPendingInvitations,
  getOrgMembershipBySlug,
} from "@/lib/organizations";
import { getCurrentUserProfile } from "@/lib/auth";
import { canInvite, canManageTeam } from "@/lib/permissions";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ orgSlug: string }> };

export default async function TeamSettingsPage({ params }: PageProps) {
  const { orgSlug } = await params;
  const membership = await getOrgMembershipBySlug(orgSlug);
  const profile = await getCurrentUserProfile();
  if (!membership || !profile) notFound();

  const orgId = membership.organization.id;
  const role = membership.organization.role;

  const [members, invites] = await Promise.all([
    fetchOrgMembers(orgId),
    fetchPendingInvitations(orgId),
  ]);

  const showInvite = canInvite(role);
  const showRoleMgmt = canManageTeam(role);

  return (
    <div className="space-y-8 w-full max-w-3xl">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Name your workspace, manage people, and see your plan.
          </p>
        </div>
        <SettingsSubnav orgSlug={orgSlug} current="team" />
        <div>
          <h2 className="text-lg font-semibold tracking-tight">People</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Who’s in the workspace, what they can do, and pending invites.
          </p>
        </div>
      </div>

      {showInvite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite people</CardTitle>
            <CardDescription>
              We’ll create a link you send them. They sign in with that email, then accept from{" "}
              <strong className="text-foreground">Invites</strong> in the sidebar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm organizationId={orgId} orgSlug={orgSlug} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who’s here</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamMembersTable
            members={members}
            currentUserId={profile.id}
            organizationId={orgId}
            orgSlug={orgSlug}
            canManageRoles={showRoleMgmt}
            canRemove={showRoleMgmt}
            currentOrgRole={role}
          />
        </CardContent>
      </Card>

      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invites still open</CardTitle>
            <CardDescription className="text-xs">
              <strong className="text-foreground">Invited</strong> — they haven’t created an account
              yet. <strong className="text-foreground">Registered</strong> — they’re signed in and
              can accept from Invites.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col gap-1 border-b border-border/60 pb-3 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:pb-2"
              >
                <span className="min-w-0 font-mono text-xs break-all">{inv.email}</span>
                <span className="text-muted-foreground text-sm capitalize sm:shrink-0">
                  {inv.role.replace("org_", "")} · {inv.status}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
