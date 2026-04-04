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
  Search,
  Settings,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard,
  search: Search,
  forms: ClipboardList,
  cases: Briefcase,
  items: Kanban,
  activity: ScrollText,
  team: Users,
  settings: Settings,
  invitations: Mail,
  questionnaires: ClipboardCheck,
} as const;

export function SidebarNav({
  items,
  base,
  onNavigate,
}: {
  items: { href: string; label: string; icon: keyof typeof ICONS; badge?: number }[];
  base: string;
  /** Close mobile drawer after navigation */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <ul className="space-y-0.5" aria-label="Workspace">
      {items.map(({ href, label, icon, badge }) => {
        const Icon = ICONS[icon];
        let active = false;
        if (label === "Invitations") {
          active = pathname === "/invitations" || pathname.startsWith("/invitations/");
        } else if (label === "Search") {
          active = pathname.startsWith(`${base}/search`);
        } else if (label === "Forms") {
          active = pathname.startsWith(`${base}/forms`);
        } else if (label === "Questionnaires") {
          active = pathname.startsWith(`${base}/questionnaires`);
        } else if (label === "Team") {
          active = pathname.startsWith(`${base}/settings/team`);
        } else if (label === "Cases") {
          active = pathname.startsWith(`${base}/cases`);
        } else if (label === "Settings") {
          active =
            pathname.startsWith(`${base}/settings`) &&
            !pathname.startsWith(`${base}/settings/team`);
        } else {
          active =
            pathname === href ||
            (href.endsWith("/items")
              ? pathname.startsWith(`${href}/`)
              : pathname.startsWith(`${href}/`));
        }
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
