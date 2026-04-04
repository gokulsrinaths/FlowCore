"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
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

function AccountFooter({ profile }: { profile: UserRow }) {
  return (
    <div className="border-t border-border/60 p-3">
      <p className="mb-2 truncate text-xs font-medium text-foreground">
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
  );
}

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
          size="sm"
          className="h-9 shrink-0 touch-manipulation gap-2 px-2.5"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="size-4 shrink-0" aria-hidden />
          <span className="text-xs font-medium">Menu</span>
        </Button>
        <Link
          href={`${base}/dashboard`}
          className="shrink-0 font-semibold tracking-tight touch-manipulation"
          onClick={() => setMenuOpen(false)}
        >
          FlowCore
        </Link>
        <div className="ml-auto min-w-0 max-w-[min(11rem,calc(100vw-8rem))] pl-2">
          <OrgSwitcher
            current={organization}
            organizations={allOrgs}
            triggerClassName="min-h-9 w-full py-2"
          />
        </div>
      </header>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent
          showCloseButton
          className="top-0 left-0 flex h-[100dvh] max-h-[100dvh] w-[min(20rem,calc(100vw-2rem))] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-r border-y-0 border-l-0 p-0 sm:max-w-none"
        >
          <DialogHeader className="border-b border-border/60 px-4 py-3 text-left">
            <DialogTitle className="text-base">Menu</DialogTitle>
          </DialogHeader>
          <nav
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
            aria-label="Workspace"
          >
            <SidebarNav
              items={nav}
              base={base}
              onNavigate={() => setMenuOpen(false)}
            />
          </nav>
          <AccountFooter profile={profile} />
        </DialogContent>
      </Dialog>

      {/* Desktop: labeled sidebar — no hover-only navigation */}
      <aside
        className={cn(
          "relative z-30 hidden w-52 shrink-0 flex-col border-border/80 bg-card/40 md:flex",
          "md:min-h-screen md:border-r"
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-3">
            <Link
              href={`${base}/dashboard`}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="FlowCore — home"
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
                aria-hidden
              >
                FC
              </span>
              <span className="truncate text-sm font-semibold tracking-tight">FlowCore</span>
            </Link>
          </div>

          <nav
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2 py-3"
            aria-label="Workspace navigation"
          >
            <SidebarNav items={nav} base={base} />
          </nav>

          <AccountFooter profile={profile} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
