import Link from "next/link";
import { LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotificationBell } from "@/components/notification-bell";
import { SidebarNav } from "@/components/sidebar-nav";
import { OrgSwitcher } from "@/components/org-switcher";
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
    { href: `${base}/cases`, label: "Cases", icon: "cases" as const },
    { href: `${base}/items`, label: "Items", icon: "items" as const },
    { href: `${base}/activity`, label: "Activity", icon: "activity" as const },
    { href: `${base}/settings/team`, label: "Team", icon: "team" as const },
    { href: `${base}/settings/general`, label: "Settings", icon: "settings" as const },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <aside className="border-b md:border-b-0 md:border-r border-border/80 bg-card/40 md:w-56 shrink-0 md:min-h-screen flex flex-col">
        <div className="p-4 border-b border-border/60 flex items-center justify-between gap-2">
          <Link href={`${base}/dashboard`} className="font-semibold tracking-tight">
            FlowCore
          </Link>
        </div>
        <div className="p-3 border-b border-border/60">
          <OrgSwitcher current={organization} organizations={allOrgs} />
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <SidebarNav items={nav} base={base} />
        </nav>
        <div className="p-3 border-t border-border/60 text-xs text-muted-foreground truncate">
          {profile.name ?? profile.email ?? "Signed in"}
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border/80 bg-card/30 backdrop-blur-sm sticky top-0 z-40">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <form action={`${base}/search`} method="get" className="flex-1 min-w-[200px] max-w-md">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  name="q"
                  placeholder="Search items, comments, people…"
                  className="pl-9 h-9 bg-background/80"
                  type="search"
                />
              </div>
            </form>
            <NotificationBell orgSlug={organization.slug} />
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
                <LogOut className="size-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </form>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
