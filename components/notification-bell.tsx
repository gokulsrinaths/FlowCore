"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  Layers,
  MessageSquare,
  UserPlus,
  Zap,
  CheckCircle2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  fetchNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";
import { buttonVariants } from "@/lib/button-variants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { NotificationRow } from "@/types";

function notificationVisual(n: NotificationRow): { icon: ReactNode; label: string } {
  const t = n.type ?? "";
  switch (t) {
    case "escalation":
      return {
        icon: <AlertTriangle className="size-4 text-amber-600 shrink-0" />,
        label: "Overdue / needs attention",
      };
    case "reminder":
      return {
        icon: <Bell className="size-4 text-yellow-600 shrink-0" />,
        label: "Reminder",
      };
    case "comment":
      return {
        icon: <MessageSquare className="size-4 text-sky-600 shrink-0" />,
        label: "Comment",
      };
    case "assignment":
      return {
        icon: <UserPlus className="size-4 text-emerald-600 shrink-0" />,
        label: "Assigned",
      };
    case "status":
      return {
        icon: <CheckCircle2 className="size-4 text-violet-600 shrink-0" />,
        label: "Status",
      };
    case "case_activity":
      return {
        icon: <Layers className="size-4 text-blue-600 shrink-0" />,
        label: "Case updates",
      };
    default:
      return {
        icon: <Zap className="size-4 text-muted-foreground shrink-0" />,
        label: "Update",
      };
  }
}

/** Group rows that share the same case (entity_id) when multiple updates exist */
function groupNotificationsForDisplay(rows: NotificationRow[]) {
  const byCase = new Map<string, NotificationRow[]>();
  for (const n of rows) {
    const hasCaseHint =
      n.type === "case_activity" ||
      (typeof n.metadata?.case_title === "string" && n.metadata.case_title.length > 0);
    const caseKey =
      n.entity_id != null && hasCaseHint ? `e:${n.entity_id}` : null;
    if (!caseKey) continue;
    const list = byCase.get(caseKey) ?? [];
    list.push(n);
    byCase.set(caseKey, list);
  }

  const result: { key: string; caseTitle?: string; items: NotificationRow[] }[] = [];
  const emittedCase = new Set<string>();

  for (const n of rows) {
    const hasCaseHint =
      n.type === "case_activity" ||
      (typeof n.metadata?.case_title === "string" && n.metadata.case_title.length > 0);
    const caseKey =
      n.entity_id != null && hasCaseHint ? `e:${n.entity_id}` : null;

    if (caseKey && byCase.has(caseKey)) {
      if (emittedCase.has(caseKey)) continue;
      emittedCase.add(caseKey);
      const group = byCase.get(caseKey)!;
      const ct =
        typeof group[0]?.metadata?.case_title === "string"
          ? group[0].metadata.case_title
          : undefined;
      result.push({
        key: caseKey,
        caseTitle: group.length > 1 ? ct : undefined,
        items: group,
      });
      continue;
    }

    result.push({ key: n.id, items: [n] });
  }

  return result;
}

export function NotificationBell({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [, start] = useTransition();

  const sections = useMemo(() => groupNotificationsForDisplay(items), [items]);

  const load = useCallback(async () => {
    const res = await fetchNotificationsAction(40);
    if (res.ok) {
      setItems(res.notifications);
      setUnread(res.unreadCount);
    }
  }, []);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      start(async () => {
        await load();
      });
    }
  }

  async function onMarkOne(id: string) {
    start(async () => {
      const res = await markNotificationReadAction(id, orgSlug);
      if (res.ok) {
        await load();
        router.refresh();
      } else toast.error(res.error);
    });
  }

  async function onMarkAll() {
    start(async () => {
      const res = await markAllNotificationsReadAction(orgSlug);
      if (res.ok) {
        await load();
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "relative gap-1.5 text-muted-foreground"
        )}
        aria-label="Notifications"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center"
            )}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[min(70vh,420px)] overflow-y-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between gap-2 font-normal">
            <span>Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  onMarkAll();
                }}
              >
                Mark all read
              </button>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-2 py-6 text-sm text-muted-foreground text-center">No notifications</div>
        ) : (
          sections.map((section) => (
            <div key={section.key} className="border-b border-border/60 last:border-0 pb-1 mb-1 last:pb-0 last:mb-0">
              {section.caseTitle != null && section.items.length > 1 && (
                <p className="px-2 pt-1.5 pb-0.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate">
                  {section.caseTitle}
                </p>
              )}
              {section.items.map((n) => {
                const { icon, label } = notificationVisual(n);
                return (
                  <DropdownMenuItem
                    key={n.id}
                    className={cn(
                      "flex flex-col items-start gap-1 p-2 cursor-default",
                      !n.read && "bg-accent/40"
                    )}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <div className="flex gap-2 w-full items-start">
                      {icon}
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                        <p className="text-sm leading-snug">{n.message}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 w-full justify-end pl-6">
                      {n.link && (
                        <Link
                          href={n.link}
                          className="text-xs text-primary hover:underline"
                          onClick={() => {
                            if (!n.read) onMarkOne(n.id);
                            setOpen(false);
                          }}
                        >
                          Open
                        </Link>
                      )}
                      {!n.read && (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:underline"
                          onClick={() => onMarkOne(n.id)}
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
