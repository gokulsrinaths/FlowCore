"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

/** Active state from routes only so nav labels can change without breaking highlights. */
export function isNavHrefActive(pathname: string, href: string, base: string): boolean {
  if (href === "/invitations") {
    return pathname === "/invitations" || pathname.startsWith("/invitations/");
  }
  if (href.startsWith(`${base}/questionnaires`)) {
    return pathname.startsWith(`${base}/questionnaires`);
  }
  if (href === `${base}/forms`) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  if (href === `${base}/cases`) {
    return pathname.startsWith(`${base}/cases`);
  }
  if (href === `${base}/items`) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  if (href === `${base}/activity`) {
    return pathname.startsWith(`${base}/activity`);
  }
  if (href === `${base}/settings/team`) {
    return pathname.startsWith(`${base}/settings/team`);
  }
  if (href.includes("/settings/general")) {
    return (
      pathname.startsWith(`${base}/settings`) &&
      !pathname.startsWith(`${base}/settings/team`)
    );
  }
  if (href === `${base}/dashboard`) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({
  items,
  base,
  onNavigate,
}: {
  items: SidebarNavItem[];
  base: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <ul className="space-y-0.5" role="list">
      {items.map(({ href, label, icon, badge }) => {
        const Icon = ICONS[icon];
        const active = isNavHrefActive(pathname, href, base);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={() => onNavigate?.()}
              title={label}
              className={cn(
                "flex min-h-10 items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors touch-manipulation",
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate leading-snug">{label}</span>
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
