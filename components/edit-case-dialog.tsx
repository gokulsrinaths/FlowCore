"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { updateCaseAction } from "@/app/actions/cases";
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
import { accusedJsonToDetails } from "@/lib/case-accused";
import { CASE_STATUS_LABELS } from "@/lib/case-labels";
import type { CaseRow, CaseStatus } from "@/types";

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

  const accusedInitial = accusedJsonToDetails(caseRow.accused);

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
              initial={accusedInitial}
            />
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
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
