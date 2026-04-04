"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Briefcase,
  ClipboardCheck,
  ClipboardList,
  Kanban,
  LayoutDashboard,
  Mail,
  ScrollText,
  Settings,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard,
  forms: ClipboardList,
  cases: Briefcase,
  items: Kanban,
  activity: ScrollText,
  team: Users,
  settings: Settings,
  invitations: Mail,
  questionnaires: ClipboardCheck,
} as const;

export type SidebarNavItem = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  badge?: number;
};

function isNavItemActive(pathname: string, href: string, label: string, base: string): boolean {
  if (label === "Invitations") {
    return pathname === "/invitations" || pathname.startsWith("/invitations/");
  }
  if (label === "Forms") {
    return pathname.startsWith(`${base}/forms`);
  }
  if (label === "Questionnaires") {
    return pathname.startsWith(`${base}/questionnaires`);
  }
  if (label === "Team") {
    return pathname.startsWith(`${base}/settings/team`);
  }
  if (label === "Cases") {
    return pathname.startsWith(`${base}/cases`);
  }
  if (label === "Settings") {
    return (
      pathname.startsWith(`${base}/settings`) &&
      !pathname.startsWith(`${base}/settings/team`)
    );
  }
  return (
    pathname === href ||
    (href.endsWith("/items")
      ? pathname.startsWith(`${href}/`)
      : pathname.startsWith(`${href}/`))
  );
}

export function SidebarNav({
  items,
  base,
  onNavigate,
  variant = "default",
}: {
  items: SidebarNavItem[];
  base: string;
  /** Close mobile drawer after navigation */
  onNavigate?: () => void;
  /** `iconsOnly`: narrow rail — hover an icon to open a flyout with full label + go action */
  variant?: "default" | "iconsOnly";
}) {
  const pathname = usePathname();
  const router = useRouter();

  if (variant === "iconsOnly") {
    return (
      <ul className="flex flex-col items-center gap-0.5 px-1">
        {items.map(({ href, label, icon, badge }) => {
          const Icon = ICONS[icon];
          const active = isNavItemActive(pathname, href, label, base);
          return (
            <li key={href} className="flex w-full justify-center">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger
                  openOnHover
                  delay={90}
                  closeDelay={180}
                  className={cn(
                    "relative flex size-10 items-center justify-center rounded-lg transition-colors touch-manipulation outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )}
                  aria-label={label}
                >
                  <Icon className="size-5 shrink-0" aria-hidden />
                  {badge != null && badge > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[10px] font-medium text-primary-foreground tabular-nums">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="right"
                  align="center"
                  sideOffset={10}
                  className="min-w-[12rem] p-1"
                >
                  <DropdownMenuItem
                    className="flex cursor-pointer items-center gap-2 px-2 py-2"
                    onSelect={() => {
                      router.push(href);
                      onNavigate?.();
                    }}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex-1 font-medium">{label}</span>
                    {badge != null && badge > 0 ? (
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-[10px] px-1.5 py-0 h-5 min-w-5 justify-center tabular-nums"
                      >
                        {badge > 99 ? "99+" : badge}
                      </Badge>
                    ) : null}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className="space-y-0.5">
      {items.map(({ href, label, icon, badge }) => {
        const Icon = ICONS[icon];
        const active = isNavItemActive(pathname, href, label, base);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={() => onNavigate?.()}
              className={cn(
                "flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors w-full touch-manipulation",
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1 min-w-0 truncate">{label}</span>
              {badge != null && badge > 0 ? (
                <Badge
                  variant="secondary"
                  className="shrink-0 text-[10px] px-1.5 py-0 h-5 min-w-5 justify-center tabular-nums"
                >
                  {badge > 99 ? "99+" : badge}
                </Badge>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
