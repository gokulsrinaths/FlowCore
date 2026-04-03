import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Members, roles, and invitations.
        </p>
      </div>

      {showInvite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite people</CardTitle>
            <CardDescription>
              Create an invite and share the link yourself. They sign in with that email, then
              accept from Invitations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm organizationId={orgId} orgSlug={orgSlug} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
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
            <CardTitle className="text-base">Open invitations</CardTitle>
            <CardDescription className="text-xs">
              Invited = not signed up yet; registered = signed in, pending accept.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex justify-between gap-4 border-b border-border/60 pb-2 last:border-0"
              >
                <span className="font-mono text-xs break-all">{inv.email}</span>
                <span className="text-muted-foreground shrink-0 capitalize">
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
