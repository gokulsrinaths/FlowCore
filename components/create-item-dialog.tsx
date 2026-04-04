"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listCaseParticipantsAction } from "@/app/actions/participants";
import { createItem } from "@/app/actions/items";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { canAssign } from "@/lib/permissions";
import type { CaseParticipant, OrgRole, UserRow } from "@/types";

const UNASSIGNED = "__unassigned__";
const NO_CASE = "__no_case__";
const ALL_DEPTS = "__all_depts__";

type CreateItemDialogProps = {
  users: UserRow[];
  profile: UserRow;
  organizationId: string;
  orgSlug: string;
  orgRole: OrgRole;
  /** Optional cases to attach the new item to */
  cases?: { id: string; title: string }[];
  /** Pre-select a case (e.g. on case detail page) */
  defaultCaseId?: string | null;
};

/**
 * Modal form backed by the `createItem` server action — validates assignment rules.
 */
export function CreateItemDialog({
  users,
  profile: _profile,
  organizationId,
  orgSlug,
  orgRole,
  cases = [],
  defaultCaseId = null,
}: CreateItemDialogProps) {
  const [open, setOpen] = useState(false);
  const [assignment, setAssignment] = useState(UNASSIGNED);
  const [caseId, setCaseId] = useState(defaultCaseId ?? NO_CASE);
  const [participants, setParticipants] = useState<CaseParticipant[]>([]);
  const [deptFilter, setDeptFilter] = useState(ALL_DEPTS);
  const assignAllowed = canAssign(orgRole);

  const departments = useMemo(() => {
    const s = new Set<string>();
    for (const u of users) {
      const d = u.department?.trim();
      if (d) s.add(d);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [users]);

  const usersForAssign = useMemo(() => {
    if (deptFilter === ALL_DEPTS) return users;
    return users.filter((u) => (u.department ?? "").trim() === deptFilter);
  }, [users, deptFilter]);

  useEffect(() => {
    if (caseId === NO_CASE) {
      setParticipants([]);
      return;
    }
    let cancelled = false;
    listCaseParticipantsAction(organizationId, caseId)
      .then((rows) => {
        if (!cancelled) setParticipants(rows);
      })
      .catch(() => {
        if (!cancelled) setParticipants([]);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, organizationId]);

  useEffect(() => {
    if (caseId === NO_CASE && assignment.startsWith("p:")) {
      setAssignment(UNASSIGNED);
    }
  }, [caseId, assignment]);

  async function onSubmit(formData: FormData) {
    formData.set("organization_id", organizationId);
    formData.set("org_slug", orgSlug);
    if (assignAllowed && assignment !== UNASSIGNED) {
      formData.set("assignment", assignment);
    }
    formData.set("case_id", caseId === NO_CASE ? "" : caseId);
    const res = await createItem(formData);
    if (res.ok) {
      toast.success("Task created");
      setOpen(false);
    } else {
      toast.error(res.error ?? "Couldn’t create the task");
    }
  }

  const externalParticipants = participants.filter((p) => p.type === "external");

  return (
    <>
      <Button
        type="button"
        className="min-h-11 w-full touch-manipulation gap-2 sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        New task
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setAssignment(UNASSIGNED);
            setCaseId(defaultCaseId ?? NO_CASE);
            setDeptFilter(ALL_DEPTS);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create item</DialogTitle>
            <DialogDescription>
              Add a new task or case. It starts in <strong>Created</strong>.
            </DialogDescription>
          </DialogHeader>
          <form action={onSubmit} className="space-y-4">
            <input type="hidden" name="organization_id" value={organizationId} />
            <input type="hidden" name="org_slug" value={orgSlug} />
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required placeholder="Short title" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                placeholder="Details, links, acceptance criteria…"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Input id="type" name="type" placeholder="bug, feature, case…" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  name="priority"
                  placeholder="low, medium, high, urgent"
                />
              </div>
            </div>
            {cases.length > 0 && (
              <div className="space-y-2">
                <Label>Link to a case (optional)</Label>
                <Select
                  value={caseId}
                  onValueChange={(v) => setCaseId(v ?? NO_CASE)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No case" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CASE}>No case</SelectItem>
                    {cases.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {assignAllowed ? (
              <div className="space-y-2">
                <Label>Assign to</Label>
                {departments.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground font-normal">
                      Filter by department
                    </Label>
                    <Select
                      value={deptFilter}
                      onValueChange={(v) => setDeptFilter(v ?? ALL_DEPTS)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All departments" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_DEPTS}>All departments</SelectItem>
                        {departments.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Select
                  value={assignment}
                  onValueChange={(v) => setAssignment(v ?? UNASSIGNED)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {usersForAssign.map((u) => (
                      <SelectItem key={u.id} value={`u:${u.id}`}>
                        {u.name ?? u.email ?? u.id}
                        {u.department?.trim() ? ` · ${u.department}` : ""}
                      </SelectItem>
                    ))}
                    {caseId !== NO_CASE &&
                      externalParticipants.map((p) => (
                        <SelectItem key={p.id} value={`p:${p.id}`}>
                          External: {p.email ?? p.id}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {caseId !== NO_CASE && externalParticipants.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Add guest emails on the case page if you need to assign work to people outside
                    the workspace.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only managers and admins can assign tasks when they’re created.
              </p>
            )}
            <DialogFooter>
              <Button type="submit">Add task</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
