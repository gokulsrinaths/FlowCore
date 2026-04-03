"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { createCaseAction } from "@/app/actions/cases";
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
import type { AccusedDetails } from "@/lib/case-accused";
import { CASE_STATUS_LABELS } from "@/lib/case-labels";
import type { CaseStatus } from "@/types";

const STATUSES: CaseStatus[] = [
  "open",
  "active",
  "under_investigation",
  "closed",
];

const EMPTY_ACCUSED: AccusedDetails = { a1: "", a2: "", a3: "" };

type CreateCaseDialogProps = {
  organizationId: string;
  orgSlug: string;
};

export function CreateCaseDialog({ organizationId, orgSlug }: CreateCaseDialogProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<CaseStatus>("open");

  async function onSubmit(formData: FormData) {
    formData.set("organization_id", organizationId);
    formData.set("org_slug", orgSlug);
    formData.set("status", status);
    const res = await createCaseAction(formData);
    if (res.ok) {
      toast.success("Case created");
      setOpen(false);
    } else {
      toast.error(res.error ?? "Could not create case");
    }
  }

  return (
    <>
      <Button
        type="button"
        className="w-full justify-center gap-2 sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        New case
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enter case details</DialogTitle>
            <DialogDescription>
              Add a new case file. Tasks can be linked after the case is created.
            </DialogDescription>
          </DialogHeader>
          <form action={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">District / crime number</p>
              <p className="text-xs text-muted-foreground">
                Official district and crime reference for this file.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="case-district">District</Label>
                  <Input id="case-district" name="district" placeholder="District" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="crime_number">Crime number</Label>
                  <Input id="crime_number" name="crime_number" placeholder="Crime number" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="case-title">Case name</Label>
              <Input
                id="case-title"
                name="title"
                required
                placeholder="Case name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="case-desc">Complainant details</Label>
              <Textarea
                id="case-desc"
                name="description"
                rows={3}
                placeholder="Complainant details"
              />
            </div>
            <AccusedDetailsFields
              key={open ? "case-form-open" : "case-form-closed"}
              initial={EMPTY_ACCUSED}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="financial_impact">Defrauded amount</Label>
                <Input
                  id="financial_impact"
                  name="financial_impact"
                  type="text"
                  inputMode="decimal"
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
              <Button type="submit">Create case</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
