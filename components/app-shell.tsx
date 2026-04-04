import { AppChrome } from "@/components/app-chrome";
import { OrgSwitcher } from "@/components/org-switcher";
import { NotificationBell } from "@/components/notification-bell";
import { getActionableQuestionnaireCountForNav } from "@/app/actions/item-questionnaires";
import { getPendingInvitationCountForNav } from "@/app/actions/invitations";
import { getOrganizationsForUser } from "@/lib/organizations";
import type { OrganizationWithRole, UserRow } from "@/types";

export async function AppShell({
  children,
  organization,
  profile,
}: {
  children: React.ReactNode;
  organization: OrganizationWithRole;
  profile: UserRow;
}) {
  const [allOrgs, invitationBadge, questionnaireBadge] = await Promise.all([
    getOrganizationsForUser(),
    getPendingInvitationCountForNav(),
    getActionableQuestionnaireCountForNav(organization.id),
  ]);
  const base = `/${organization.slug}`;
  const nav = [
    { href: `${base}/dashboard`, label: "Home", icon: "dashboard" as const },
    { href: `${base}/cases`, label: "Cases", icon: "cases" as const },
    { href: `${base}/items`, label: "Tasks", icon: "items" as const },
    { href: `${base}/forms`, label: "Forms", icon: "forms" as const },
    {
      href: `${base}/questionnaires`,
      label: "Task questions",
      icon: "questionnaires" as const,
      badge: questionnaireBadge > 0 ? questionnaireBadge : undefined,
    },
    { href: `${base}/activity`, label: "Activity", icon: "activity" as const },
    {
      href: "/invitations",
      label: "Invites",
      icon: "invitations" as const,
      badge: invitationBadge > 0 ? invitationBadge : undefined,
    },
    { href: `${base}/settings/team`, label: "People", icon: "team" as const },
    { href: `${base}/settings/general`, label: "Settings", icon: "settings" as const },
  ];

  return (
    <AppChrome
      organization={organization}
      profile={profile}
      allOrgs={allOrgs}
      nav={nav}
      base={base}
    >
      <header className="sticky top-12 z-40 border-b border-border/80 bg-card/30 backdrop-blur-sm md:top-0">
        <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
          <NotificationBell orgSlug={organization.slug} />
          <div className="min-w-0 max-w-[min(16rem,calc(100vw-5rem))]">
            <OrgSwitcher
              current={organization}
              organizations={allOrgs}
              triggerClassName="w-full"
            />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </AppChrome>
  );
}
