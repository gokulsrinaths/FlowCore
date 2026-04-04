import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsSubnav } from "@/components/settings-subnav";
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
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Name your workspace, manage people, and see your plan.
          </p>
        </div>
        <SettingsSubnav orgSlug={orgSlug} current="general" />
        <div>
          <h2 className="text-lg font-semibold tracking-tight">General</h2>
          <p className="text-muted-foreground text-sm mt-1">
            How your workspace shows up to your team.
          </p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace name</CardTitle>
          <CardDescription>Everyone on your team sees this in the app.</CardDescription>
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
            Open invites →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
