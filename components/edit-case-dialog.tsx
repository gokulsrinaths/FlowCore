"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { updateCaseAction } from "@/app/actions/cases";
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
import { CASE_STATUS_LABELS } from "@/lib/case-labels";
import type { CaseRow, CaseStatus } from "@/types";

const STATUSES: CaseStatus[] = [
  "open",
  "active",
  "under_investigation",
  "closed",
];

function accusedToText(accused: unknown): string {
  if (accused == null) return "";
  if (typeof accused === "string") return accused;
  try {
    return JSON.stringify(accused, null, 2);
  } catch {
    return String(accused);
  }
}

type EditCaseDialogProps = {
  organizationId: string;
  orgSlug: string;
  caseRow: CaseRow;
};

export function EditCaseDialog({ organizationId, orgSlug, caseRow }: EditCaseDialogProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<CaseStatus>(caseRow.status);

  async function onSubmit(formData: FormData) {
    formData.set("organization_id", organizationId);
    formData.set("org_slug", orgSlug);
    formData.set("case_id", caseRow.id);
    formData.set("status", status);
    const res = await updateCaseAction(formData);
    if (res.ok) {
      toast.success("Case updated");
      setOpen(false);
    } else {
      toast.error(res.error ?? "Could not update case");
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Pencil className="size-4" />
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit case</DialogTitle>
            <DialogDescription>Update case details and status.</DialogDescription>
          </DialogHeader>
          <form action={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-case-title">Title</Label>
              <Input
                id="edit-case-title"
                name="title"
                required
                defaultValue={caseRow.title}
                placeholder="Case title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-crime_number">Reference / crime number</Label>
              <Input
                id="edit-crime_number"
                name="crime_number"
                defaultValue={caseRow.crime_number ?? ""}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-case-desc">Description</Label>
              <Textarea
                id="edit-case-desc"
                name="description"
                rows={3}
                defaultValue={caseRow.description ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-accused">Accused / parties (JSON or plain text)</Label>
              <Textarea
                id="edit-accused"
                name="accused"
                rows={4}
                defaultValue={accusedToText(caseRow.accused)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-financial">Financial impact</Label>
                <Input
                  id="edit-financial"
                  name="financial_impact"
                  type="text"
                  inputMode="decimal"
                  defaultValue={
                    caseRow.financial_impact != null ? String(caseRow.financial_impact) : ""
                  }
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
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
