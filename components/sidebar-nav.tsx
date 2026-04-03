"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Kanban,
  LayoutDashboard,
  Mail,
  ScrollText,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard,
  cases: Briefcase,
  items: Kanban,
  activity: ScrollText,
  team: Users,
  settings: Settings,
  invitations: Mail,
} as const;

export function SidebarNav({
  items,
  base,
}: {
  items: { href: string; label: string; icon: keyof typeof ICONS }[];
  base: string;
}) {
  const pathname = usePathname();

  return (
    <ul className="space-y-0.5" aria-label="Workspace">
      {items.map(({ href, label, icon }) => {
        const Icon = ICONS[icon];
        let active = false;
        if (label === "Invitations") {
          active = pathname === "/invitations" || pathname.startsWith("/invitations/");
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
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
