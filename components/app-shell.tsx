import { LogOut, Search } from "lucide-react";
import Link from "next/link";
import { AppChrome } from "@/components/app-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotificationBell } from "@/components/notification-bell";
import { signOutAction } from "@/app/actions/auth";
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
  const [allOrgs, invitationBadge] = await Promise.all([
    getOrganizationsForUser(),
    getPendingInvitationCountForNav(),
  ]);
  const base = `/${organization.slug}`;
  const nav = [
    {
      href: "/invitations",
      label: "Invitations",
      icon: "invitations" as const,
      badge: invitationBadge > 0 ? invitationBadge : undefined,
    },
    { href: `${base}/dashboard`, label: "Dashboard", icon: "dashboard" as const },
    { href: `${base}/search`, label: "Search", icon: "search" as const },
    { href: `${base}/cases`, label: "Cases", icon: "cases" as const },
    { href: `${base}/forms`, label: "Forms", icon: "forms" as const },
    { href: `${base}/items`, label: "Items", icon: "items" as const },
    { href: `${base}/activity`, label: "Activity", icon: "activity" as const },
    { href: `${base}/settings/team`, label: "Team", icon: "team" as const },
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
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
          <form
            action={`${base}/search`}
            method="get"
            className="min-w-0 flex-1 basis-full sm:basis-auto sm:max-w-md"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                placeholder="Search…"
                className="bg-background/80 pl-9"
                type="search"
                autoComplete="off"
                enterKeyHint="search"
              />
            </div>
          </form>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              href="/help"
              className="inline-flex min-h-9 shrink-0 items-center rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Help
            </Link>
            <NotificationBell orgSlug={organization.slug} />
            <form action={signOutAction} className="hidden sm:block">
              <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
                <LogOut className="size-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </AppChrome>
  );
}
