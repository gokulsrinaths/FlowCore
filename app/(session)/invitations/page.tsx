import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fetchUserInvitationsInboxAction } from "@/app/actions/invitations";
import { InvitationsInbox } from "@/components/invitations-inbox";
import { buttonVariants } from "@/lib/button-variants";
import { getOrganizationsForUser } from "@/lib/organizations";
import { resolveWorkspaceFallbackHref } from "@/lib/onboarding-flow";
import { cn } from "@/lib/utils";

/**
 * Global invitations inbox (session route so users can open it before org onboarding).
 * URL: /invitations
 */
export default async function InvitationsPage() {
  const [res, orgs] = await Promise.all([
    fetchUserInvitationsInboxAction(),
    getOrganizationsForUser(),
  ]);

  const backHref = resolveWorkspaceFallbackHref(orgs.map((org) => org.slug));

  if (!res.ok) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 px-4 py-8">
        <p className="text-sm text-destructive">{res.error}</p>
        <Link
          href={backHref}
          className={cn(buttonVariants({ variant: "outline" }), "inline-flex w-full justify-center sm:w-auto")}
        >
          Go back
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="max-w-2xl mx-auto space-y-8 px-4 py-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="space-y-2">
          <Link
            href={backHref}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "gap-2 -ml-2 min-h-11 touch-manipulation text-muted-foreground sm:min-h-0"
            )}
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Your invites</h1>
          <p className="text-muted-foreground text-sm text-pretty">
            These use the email you’re signed in with. Accepting adds you to the workspace — and to
            the case, if one was included. Nothing changes until you tap Accept.
          </p>
        </div>
        <InvitationsInbox initial={res.invitations} />
      </div>
    </div>
  );
}
