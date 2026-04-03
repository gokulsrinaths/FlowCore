"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import {
  assignItemToParticipant,
  setItemDueDate,
  updateItemAssignee,
  updateItemStatus,
} from "@/app/actions/items";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  allowedNextStatuses,
  canAssign,
  canChangeStatus,
  orgRoleToWorkflowRole,
  STATUS_LABELS,
  STATUS_ORDER,
} from "@/lib/permissions";
import { priorityVariant } from "@/lib/priority-styles";
import type {
  CaseParticipant,
  ItemStatus,
  ItemWithUsers,
  OrgRole,
  UserRow,
} from "@/types";

type ItemDetailControlsProps = {
  item: ItemWithUsers;
  orgRole: OrgRole;
  users: UserRow[];
  /** When item is linked to a case, external participants can be assignees */
  caseParticipants?: CaseParticipant[];
  organizationId: string;
  orgSlug: string;
  /** Matches server RPC for `flowcore_set_item_due_date` */
  canEditDueDate: boolean;
};

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function assignmentValue(item: ItemWithUsers): string {
  if (item.assigned_to) return `u:${item.assigned_to}`;
  if (item.assigned_participant_id) return `p:${item.assigned_participant_id}`;
  return "__none__";
}

/**
 * Role-aware status + assignee controls for the detail page.
 */
export function ItemDetailControls({
  item,
  orgRole,
  users,
  caseParticipants = [],
  organizationId,
  orgSlug,
  canEditDueDate,
}: ItemDetailControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const dueInputRef = useRef<HTMLInputElement>(null);
  const wf = orgRoleToWorkflowRole(orgRole);
  const assignOk = canAssign(orgRole);
  const externalParticipants = caseParticipants.filter((p) => p.type === "external");

  function onStatus(next: ItemStatus) {
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
      } else {
        toast.error(res.error ?? "Update failed");
      }
    });
  }

  function onAssignment(next: string | null) {
    const v = next ?? "__none__";
    startTransition(async () => {
      if (v === "__none__") {
        const res = await assignItemToParticipant(
          organizationId,
          orgSlug,
          item.id,
          null
        );
        if (res.ok) {
          toast.success("Assignee updated");
          router.refresh();
        } else toast.error(res.error ?? "Update failed");
        return;
      }
      if (v.startsWith("u:")) {
        const res = await updateItemAssignee(
          organizationId,
          orgSlug,
          item.id,
          v.slice(2)
        );
        if (res.ok) {
          toast.success("Assignee updated");
          router.refresh();
        } else toast.error(res.error ?? "Update failed");
        return;
      }
      if (v.startsWith("p:")) {
        const res = await assignItemToParticipant(
          organizationId,
          orgSlug,
          item.id,
          v.slice(2)
        );
        if (res.ok) {
          toast.success("Assignee updated");
          router.refresh();
        } else toast.error(res.error ?? "Update failed");
      }
    });
  }

  const statusOptions = allowedNextStatuses(wf, item.status);

  const readOnlyAssignee =
    item.assignee?.name ??
    item.assignee?.email ??
    item.assigneeParticipant?.displayName ??
    item.assigneeParticipant?.email ??
    "Unassigned";

  function onSaveDueDate() {
    const el = document.getElementById(
      `due-date-${item.id}`
    ) as HTMLInputElement | null;
    const raw = el?.value?.trim() ?? "";
    startTransition(async () => {
      const iso = raw ? new Date(raw).toISOString() : null;
      if (raw && Number.isNaN(new Date(raw).getTime())) {
        toast.error("Invalid due date");
        return;
      }
      const res = await setItemDueDate(organizationId, orgSlug, item.id, iso);
      if (res.ok) {
        toast.success(iso ? "Due date saved" : "Due date cleared");
        router.refresh();
      } else toast.error(res.error ?? "Update failed");
    });
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          value={item.status}
          onValueChange={(v) => {
            if (v) onStatus(v as ItemStatus);
          }}
          disabled={pending}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ORDER.map((s) => (
              <SelectItem
                key={s}
                value={s}
                disabled={!statusOptions.includes(s)}
              >
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Assigned to</Label>
        {assignOk ? (
          <Select
            value={assignmentValue(item)}
            onValueChange={(v) => onAssignment(v)}
            disabled={pending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Unassigned</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={`u:${u.id}`}>
                  {u.name ?? u.email ?? u.id}
                </SelectItem>
              ))}
              {item.case_id &&
                externalParticipants.map((p) => (
                  <SelectItem key={p.id} value={`p:${p.id}`}>
                    External: {p.email ?? p.id}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-muted-foreground py-2">{readOnlyAssignee}</p>
        )}
      </div>
      <div className="sm:col-span-2 flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground">Priority:</span>
        {item.priority ? (
          <Badge variant={priorityVariant(item.priority)}>{item.priority}</Badge>
        ) : (
          <Badge variant="outline">None</Badge>
        )}
        {item.type && (
          <Badge variant="secondary" className="font-normal">
            {item.type}
          </Badge>
        )}
      </div>
      <div className="sm:col-span-2 space-y-2">
        <Label htmlFor={`due-date-${item.id}`}>Due date</Label>
        {canEditDueDate ? (
          <div className="flex flex-wrap items-end gap-2">
            <Input
              ref={dueInputRef}
              id={`due-date-${item.id}`}
              type="datetime-local"
              className="max-w-xs"
              defaultValue={toDatetimeLocalValue(item.due_date)}
              disabled={pending}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={onSaveDueDate}
            >
              Save due date
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (dueInputRef.current) dueInputRef.current.value = "";
                startTransition(async () => {
                  const res = await setItemDueDate(
                    organizationId,
                    orgSlug,
                    item.id,
                    null
                  );
                  if (res.ok) {
                    toast.success("Due date cleared");
                    router.refresh();
                  } else toast.error(res.error ?? "Update failed");
                });
              }}
            >
              Clear
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-1">
            {item.due_date
              ? new Date(item.due_date).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "None"}
          </p>
        )}
      </div>
    </div>
  );
}
