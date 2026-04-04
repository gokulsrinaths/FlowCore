"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { updateCaseAction } from "@/app/actions/cases";
import { addCaseParticipantAction } from "@/app/actions/participants";
import { AccusedDetailsFields } from "@/components/accused-details-fields";
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
import { accusedJsonToEntries } from "@/lib/case-accused";
import { CASE_STATUS_LABELS } from "@/lib/case-labels";
import { cn } from "@/lib/utils";
import type { CaseParticipant, CaseRow, CaseStatus, UserRow } from "@/types";

const STATUSES: CaseStatus[] = [
  "open",
  "active",
  "under_investigation",
  "closed",
];

type EditCaseDialogProps = {
  organizationId: string;
  orgSlug: string;
  caseRow: CaseRow;
  orgUsers: UserRow[];
  participants: CaseParticipant[];
};

export function EditCaseDialog({
  organizationId,
  orgSlug,
  caseRow,
  orgUsers,
  participants,
}: EditCaseDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<CaseStatus>(caseRow.status);
  const [addMemberIds, setAddMemberIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const existingInternalIds = useMemo(
    () =>
      new Set(
        participants
          .filter((p) => p.type === "internal" && p.user_id)
          .map((p) => p.user_id as string)
      ),
    [participants]
  );

  const addableUsers = useMemo(
    () => orgUsers.filter((u) => !existingInternalIds.has(u.id)),
    [orgUsers, existingInternalIds]
  );

  useEffect(() => {
    if (open) setStatus(caseRow.status);
  }, [open, caseRow.status]);

  function toggleAddMember(userId: string) {
    setAddMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function onSubmit(formData: FormData) {
    formData.set("organization_id", organizationId);
    formData.set("org_slug", orgSlug);
    formData.set("case_id", caseRow.id);
    formData.set("status", status);
    setSubmitting(true);
    try {
      const res = await updateCaseAction(formData);
      if (!res.ok) {
        toast.error(res.error ?? "Could not update case");
        return;
      }
      for (const uid of addMemberIds) {
        const add = await addCaseParticipantAction(organizationId, orgSlug, caseRow.id, {
          userId: uid,
        });
        if (!add.ok) {
          toast.error(add.error ?? "Could not add a case member");
          router.refresh();
          return;
        }
      }
      toast.success(
        addMemberIds.size > 0 ? "Case updated and access updated" : "Case updated"
      );
      setAddMemberIds(new Set());
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const accusedInitialEntries = accusedJsonToEntries(caseRow.accused);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-center gap-2 sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-4" />
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit case</DialogTitle>
            <DialogDescription>Update case details and status.</DialogDescription>
          </DialogHeader>
          <form action={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">District / crime number</p>
              <p className="text-xs text-muted-foreground">
                Official district and crime reference for this file.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-case-district">District</Label>
                  <Input
                    id="edit-case-district"
                    name="district"
                    defaultValue={caseRow.district ?? ""}
                    placeholder="District"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-crime_number">Crime number</Label>
                  <Input
                    id="edit-crime_number"
                    name="crime_number"
                    defaultValue={caseRow.crime_number ?? ""}
                    placeholder="Crime number"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-case-title">Case name</Label>
              <Input
                id="edit-case-title"
                name="title"
                required
                defaultValue={caseRow.title}
                placeholder="Case name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-case-desc">Complainant details</Label>
              <Textarea
                id="edit-case-desc"
                name="description"
                rows={3}
                defaultValue={caseRow.description ?? ""}
                placeholder="Complainant details"
              />
            </div>
            <AccusedDetailsFields
              key={`${caseRow.id}-${open ? "o" : "c"}`}
              initialEntries={accusedInitialEntries}
            />
            {addableUsers.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <Label className="text-sm font-medium">Add workspace members to this case</Label>
                <p className="text-xs text-muted-foreground">
                  {existingInternalIds.size > 0
                    ? `${existingInternalIds.size} member(s) already on the roster. Select more to grant access.`
                    : "No internal members on the roster yet. Select people to add."}
                </p>
                <ul className="max-h-36 space-y-2 overflow-y-auto pr-1">
                  {addableUsers.map((u) => (
                    <li key={u.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/80"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={addMemberIds.has(u.id)}
                          onChange={() => toggleAddMember(u.id)}
                          className="size-4 shrink-0 rounded border-input"
                        />
                        <span>{u.name ?? u.email ?? u.id}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : orgUsers.length > 0 ? (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border/70 p-3">
                Every workspace member is already on this case roster. Remove people from the Case
                participants section on the case page if needed.
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-financial">Defrauded amount</Label>
                <Input
                  id="edit-financial"
                  name="financial_impact"
                  type="text"
                  inputMode="decimal"
                  defaultValue={
                    caseRow.financial_impact != null ? String(caseRow.financial_impact) : ""
                  }
                  placeholder="Amount (optional)"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => v && setStatus(v as CaseStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {CASE_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
