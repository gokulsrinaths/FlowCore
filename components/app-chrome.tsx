"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { OrgSwitcher } from "@/components/org-switcher";
import { SidebarNav } from "@/components/sidebar-nav";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ComponentProps } from "react";
import type { OrganizationWithRole, UserRow } from "@/types";

const MOBILE_BAR_PX = 48;

type AppChromeProps = {
  organization: OrganizationWithRole;
  profile: UserRow;
  allOrgs: OrganizationWithRole[];
  nav: ComponentProps<typeof SidebarNav>["items"];
  base: string;
  children: React.ReactNode;
};

export function AppChrome({
  organization,
  profile,
  allOrgs,
  nav,
  base,
  children,
}: AppChromeProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="min-h-screen flex flex-col bg-background md:flex-row"
      style={{ "--mobile-app-bar": `${MOBILE_BAR_PX}px` } as React.CSSProperties}
    >
      {/* Mobile: sticky app bar */}
      <header
        className="sticky top-0 z-[60] flex h-12 shrink-0 items-center gap-2 border-b border-border/80 bg-background/95 px-3 backdrop-blur-md supports-[padding:max(0px)]:pt-[max(0px,env(safe-area-inset-top))] md:hidden"
        style={{ minHeight: MOBILE_BAR_PX }}
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 shrink-0 touch-manipulation"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="size-4" />
        </Button>
        <Link
          href={`${base}/dashboard`}
          className="font-semibold tracking-tight touch-manipulation"
          onClick={() => setMenuOpen(false)}
        >
          FlowCore
        </Link>
        <span className="ml-auto min-w-0 truncate text-right text-xs text-muted-foreground">
          {organization.name}
        </span>
      </header>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent
          showCloseButton
          className="top-0 left-0 flex h-[100dvh] max-h-[100dvh] w-[min(20rem,calc(100vw-2rem))] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-r border-y-0 border-l-0 p-0 sm:max-w-none"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Workspace menu</DialogTitle>
          </DialogHeader>
          <div className="border-b border-border/60 p-3">
            <OrgSwitcher current={organization} organizations={allOrgs} />
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
            <SidebarNav
              items={nav}
              base={base}
              onNavigate={() => setMenuOpen(false)}
            />
          </nav>
          <div className="border-t border-border/60 p-3">
            <p className="mb-2 truncate text-xs text-muted-foreground">
              {profile.name ?? profile.email ?? "Signed in"}
            </p>
            <form action={signOutAction}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="w-full touch-manipulation"
              >
                Sign out
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-border/80 bg-card/40 md:flex md:min-h-screen md:border-r">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 p-4">
          <Link href={`${base}/dashboard`} className="font-semibold tracking-tight">
            FlowCore
          </Link>
        </div>
        <div className="border-b border-border/60 p-3">
          <OrgSwitcher current={organization} organizations={allOrgs} />
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <SidebarNav items={nav} base={base} />
        </nav>
        <div className="border-t border-border/60 p-3 space-y-2">
          <p className="truncate text-xs text-muted-foreground">
            {profile.name ?? profile.email ?? "Signed in"}
          </p>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" size="sm" className="w-full touch-manipulation">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
