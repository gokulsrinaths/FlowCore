"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { createCaseAction } from "@/app/actions/cases";
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
import type { CaseStatus } from "@/types";

const STATUSES: CaseStatus[] = [
  "open",
  "active",
  "under_investigation",
  "closed",
];

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
      <Button type="button" className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New case
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create case</DialogTitle>
            <DialogDescription>
              Add an investigation case. Tasks are generic items linked to this case.
            </DialogDescription>
          </DialogHeader>
          <form action={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="case-title">Title</Label>
              <Input id="case-title" name="title" required placeholder="Case title" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="crime_number">Reference / crime number</Label>
              <Input id="crime_number" name="crime_number" placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="case-desc">Description</Label>
              <Textarea id="case-desc" name="description" rows={3} placeholder="Summary" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accused">Accused / parties (JSON or plain text)</Label>
              <Textarea
                id="accused"
                name="accused"
                rows={3}
                placeholder='e.g. {"name": "…"} or free text'
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="financial_impact">Financial impact</Label>
                <Input
                  id="financial_impact"
                  name="financial_impact"
                  type="text"
                  inputMode="decimal"
                  placeholder="Optional number"
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
