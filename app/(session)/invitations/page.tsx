import { fetchUserInvitationsInboxAction } from "@/app/actions/invitations";
import { AppShell } from "@/components/app-shell";
import { InvitationsInbox } from "@/components/invitations-inbox";
import { PageBackLink } from "@/components/page-back-link";
import { getCurrentUserProfile } from "@/lib/auth";
import { getOrganizationsForUser } from "@/lib/organizations";
import { isOnboardingComplete, resolveWorkspaceFallbackHref } from "@/lib/onboarding-flow";
import type { UserInvitationsInbox } from "@/types";

function InvitationsPageContent({
  backHref,
  invitations,
}: {
  backHref: string;
  invitations: UserInvitationsInbox;
}) {
  return (
    <div className="w-full max-w-3xl space-y-8">
      <PageBackLink href={backHref} label="Back to home" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invites</h1>
        <p className="mt-1 max-w-2xl text-pretty text-sm text-muted-foreground">
          These use the email you&apos;re signed in with. Accepting adds you to the workspace and,
          when included, links you into the case context too.
        </p>
      </div>
      <InvitationsInbox initial={invitations} />
    </div>
  );
}

/**
 * Global invitations inbox (session route so users can open it before org onboarding).
 * URL: /invitations
 */
export default async function InvitationsPage() {
  const [res, orgs, profile] = await Promise.all([
    fetchUserInvitationsInboxAction(),
    getOrganizationsForUser(),
    getCurrentUserProfile(),
  ]);

  const backHref = resolveWorkspaceFallbackHref(orgs.map((org) => org.slug));
  const canUseAppShell = Boolean(profile && isOnboardingComplete(profile) && orgs.length > 0);

  if (!res.ok) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <PageBackLink href={backHref} label="Back to home" />
        <p className="text-sm text-destructive">{res.error}</p>
      </div>
    );
  }

  if (canUseAppShell && profile) {
    return (
      <AppShell organization={orgs[0]!} profile={profile}>
        <InvitationsPageContent backHref={backHref} invitations={res.invitations} />
      </AppShell>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
        <InvitationsPageContent backHref={backHref} invitations={res.invitations} />
      </div>
    </div>
  );
}
