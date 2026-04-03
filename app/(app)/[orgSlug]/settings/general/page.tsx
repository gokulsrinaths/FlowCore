import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GeneralSettingsForm } from "@/components/settings-general-form";
import { buttonVariants } from "@/lib/button-variants";
import { getOrgMembershipBySlug } from "@/lib/organizations";
import { cn } from "@/lib/utils";
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your invitations</CardTitle>
          <CardDescription>
            Accept or reject workspace and case invites sent to your email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/invitations"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "inline-flex w-full justify-center sm:w-auto"
            )}
          >
            View invitations →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
