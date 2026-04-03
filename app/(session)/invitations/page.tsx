import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fetchUserInvitationsAction } from "@/app/actions/invitations";
import { PendingInvitationsList } from "@/components/pending-invitations-list";
import { buttonVariants } from "@/lib/button-variants";
import { getOrganizationsForUser } from "@/lib/organizations";
import { cn } from "@/lib/utils";

export default async function InvitationsPage() {
  const [res, orgs] = await Promise.all([
    fetchUserInvitationsAction(),
    getOrganizationsForUser(),
  ]);

  const backHref =
    orgs.length > 0 ? `/${orgs[0].slug}/dashboard` : "/onboarding";

  if (!res.ok) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 px-4 py-8">
        <p className="text-sm text-destructive">{res.error}</p>
        <Link href={backHref} className={cn(buttonVariants({ variant: "outline" }))}>
          Go back
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="max-w-2xl mx-auto space-y-8 px-4 py-8">
        <div className="space-y-2">
          <Link
            href={backHref}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "gap-2 -ml-2 text-muted-foreground"
            )}
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Invitations</h1>
          <p className="text-muted-foreground text-sm text-pretty">
            Accept or decline invitations to workspaces and cases. You are only added after you
            accept.
          </p>
        </div>
        <PendingInvitationsList initial={res.invitations} />
      </div>
    </div>
  );
}
