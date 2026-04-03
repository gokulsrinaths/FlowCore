import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GeneralSettingsForm } from "@/components/settings-general-form";
import { getOrgMembershipBySlug } from "@/lib/organizations";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ orgSlug: string }> };

export default async function GeneralSettingsPage({ params }: PageProps) {
  const { orgSlug } = await params;
  const membership = await getOrgMembershipBySlug(orgSlug);
  if (!membership) notFound();

  const canEdit =
    membership.organization.role === "org_owner" ||
    membership.organization.role === "org_admin";

  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">General</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Workspace name and basics.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace name</CardTitle>
          <CardDescription>Shown in the sidebar and dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <GeneralSettingsForm
            organizationId={membership.organization.id}
            orgSlug={orgSlug}
            initialName={membership.organization.name}
            disabled={!canEdit}
          />
        </CardContent>
      </Card>
    </div>
  );
}
