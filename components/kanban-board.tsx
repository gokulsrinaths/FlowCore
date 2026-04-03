"use client";

import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateItemStatus } from "@/app/actions/items";
import { ItemCard } from "@/components/item-card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  allowedNextStatuses,
  canChangeStatus,
  orgRoleToWorkflowRole,
  STATUS_LABELS,
  STATUS_ORDER,
} from "@/lib/permissions";
import type {
  CaseParticipant,
  ItemStatus,
  ItemWithUsers,
  OrgRole,
  UserRow,
} from "@/types";
import { cn } from "@/lib/utils";

type KanbanBoardProps = {
  items: ItemWithUsers[];
  users: UserRow[];
  /** External case participants (for assignee filter + display) */
  caseParticipants?: CaseParticipant[];
  orgRole: OrgRole;
  organizationId: string;
  orgSlug: string;
};

function KanbanColumn({
  status,
  children,
}: {
  status: ItemStatus;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[420px] flex-1 flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-3 min-w-[240px]",
        isOver && "ring-2 ring-primary/25 bg-muted/40"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          {STATUS_LABELS[status]}
        </h2>
      </div>
      <div className="flex flex-col gap-3 min-h-[200px]">{children}</div>
    </div>
  );
}

/**
 * Four-column Kanban with drag-and-drop plus per-card status Select (role-aware).
 */
export function KanbanBoard({
  items,
  users,
  caseParticipants = [],
  orgRole,
  organizationId,
  orgSlug,
}: KanbanBoardProps) {
  const router = useRouter();
  const wf = orgRoleToWorkflowRole(orgRole);
  const [query, setQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      const matchesQ =
        !q ||
        it.title.toLowerCase().includes(q) ||
        (it.description ?? "").toLowerCase().includes(q);
      const matchesAssignee =
        assigneeFilter === "all" ||
        (assigneeFilter.startsWith("u:") &&
          it.assigned_to === assigneeFilter.slice(2)) ||
        (assigneeFilter.startsWith("p:") &&
          it.assigned_participant_id === assigneeFilter.slice(2));
      const matchesPriority =
        priorityFilter === "all" ||
        (it.priority ?? "").toLowerCase() === priorityFilter.toLowerCase();
      return matchesQ && matchesAssignee && matchesPriority;
    });
  }, [items, query, assigneeFilter, priorityFilter]);
  const externalForFilter = caseParticipants.filter((p) => p.type === "external");

  const grouped = useMemo(() => {
    const map: Record<ItemStatus, ItemWithUsers[]> = {
      created: [],
      in_progress: [],
      under_review: [],
      completed: [],
    };
    for (const it of filtered) {
      map[it.status].push(it);
    }
    return map;
  }, [filtered]);

  function resolveDropTarget(overId: string | number): ItemStatus | undefined {
    const sid = String(overId);
    if (STATUS_ORDER.includes(sid as ItemStatus)) {
      return sid as ItemStatus;
    }
    const targetItem = items.find((i) => i.id === sid);
    return targetItem?.status;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const item = items.find((i) => i.id === active.id);
    if (!item) return;
    const next = resolveDropTarget(over.id);
    if (!next || next === item.status) return;
    if (!canChangeStatus(wf, item.status, next)) {
      toast.error("You cannot move this item to that stage");
      return;
    }
    startTransition(async () => {
      const res = await updateItemStatus(organizationId, orgSlug, item.id, next);
      if (res.ok) {
        toast.success("Status updated");
        router.refresh();
      } else toast.error(res.error ?? "Update failed");
    });
  }

  function handleSelectStatus(item: ItemWithUsers, next: ItemStatus) {
    if (next === item.status) return;
    if (!canChangeStatus(wf, item.status, next)) {
      toast.error("You cannot move this item to that stage");
      return;
    }
    startTransition(async () => {
      const res = await updateItemStatus(organizationId, orgSlug, item.id, next);
      if (res.ok) {
        toast.success("Status updated");
        router.refresh();
      } else toast.error(res.error ?? "Update failed");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search items…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              Assignee
            </span>
            <Select
              value={assigneeFilter}
              onValueChange={(v) => setAssigneeFilter(v ?? "all")}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={`u:${u.id}`}>
                    {u.name ?? u.email ?? u.id}
                  </SelectItem>
                ))}
                {externalForFilter.map((p) => (
                  <SelectItem key={p.id} value={`p:${p.id}`}>
                    External: {p.email ?? p.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              Priority
            </span>
            <Select
              value={priorityFilter}
              onValueChange={(v) => setPriorityFilter(v ?? "all")}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="low">low</SelectItem>
                <SelectItem value="medium">medium</SelectItem>
                <SelectItem value="high">high</SelectItem>
                <SelectItem value="urgent">urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-4 lg:grid-cols-4 md:grid-cols-2">
          {STATUS_ORDER.map((status) => (
            <KanbanColumn key={status} status={status}>
              {grouped[status].length === 0 && (
                <p className="text-xs text-muted-foreground py-6 text-center border border-dashed rounded-lg">
                  No items here
                </p>
              )}
              {grouped[status].map((item) => {
                const options = allowedNextStatuses(wf, item.status);
                return (
                  <div key={item.id} className="space-y-2">
                    <ItemCard item={item} orgSlug={orgSlug} />
                    <Select
                      value={item.status}
                      onValueChange={(v) => {
                        if (v) handleSelectStatus(item, v as ItemStatus);
                      }}
                      disabled={isPending}
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-full h-8 text-xs"
                        aria-label="Change status"
                      >
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_ORDER.map((s) => (
                          <SelectItem key={s} value={s} disabled={!options.includes(s)}>
                            {STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </KanbanColumn>
          ))}
        </div>
      </DndContext>
    </div>
  );
}
