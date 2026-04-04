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
          <DialogHeader className="sr-only">
            <DialogTitle>Workspace menu</DialogTitle>
          </DialogHeader>
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

      {/* Desktop sidebar: collapsed rail (logo mark); expands on hover / focus-within */}
      <aside
        className={cn(
          "group/sidebar relative z-30 hidden shrink-0 flex-col border-border/80 bg-card/40 md:flex",
          "md:min-h-screen md:border-r",
          "w-14 overflow-hidden motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out",
          "hover:w-56 focus-within:w-56"
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className={cn(
              "flex shrink-0 items-center justify-center border-b border-border/60 px-2 py-3",
              "group-hover/sidebar:justify-start group-hover/sidebar:px-3",
              "group-focus-within/sidebar:justify-start group-focus-within/sidebar:px-3"
            )}
          >
            <Link
              href={`${base}/dashboard`}
              className="flex min-h-10 min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="FlowCore — Dashboard"
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground",
                  "group-hover/sidebar:hidden group-focus-within/sidebar:hidden"
                )}
                aria-hidden
              >
                FC
              </span>
              <span
                className={cn(
                  "hidden truncate font-semibold tracking-tight",
                  "group-hover/sidebar:block group-focus-within/sidebar:block"
                )}
              >
                FlowCore
              </span>
            </Link>
          </div>

          <div
            className={cn(
              "hidden min-h-0 flex-1 flex-col",
              "group-hover/sidebar:flex group-focus-within/sidebar:flex"
            )}
          >
            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3">
              <SidebarNav items={nav} base={base} />
            </nav>
            <div className="shrink-0 space-y-2 border-t border-border/60 p-3">
              <p className="truncate text-xs text-muted-foreground">
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
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
