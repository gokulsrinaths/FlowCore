"use client";

import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createCaseAction } from "@/app/actions/cases";
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
import { CASE_STATUS_LABELS } from "@/lib/case-labels";
import type { CaseStatus, UserRow } from "@/types";
import { cn } from "@/lib/utils";

const STATUSES: CaseStatus[] = [
  "open",
  "active",
  "under_investigation",
  "closed",
];

type CreateCaseDialogProps = {
  organizationId: string;
  orgSlug: string;
  orgUsers: UserRow[];
};

export function CreateCaseDialog({ organizationId, orgSlug, orgUsers }: CreateCaseDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [status, setStatus] = useState<CaseStatus>("open");
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  function toggleMember(userId: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function onSubmit(formData: FormData) {
    formData.set("organization_id", organizationId);
    formData.set("org_slug", orgSlug);
    formData.set("status", status);
    setSubmitting(true);
    try {
      const res = await createCaseAction(formData);
      if (!res.ok || !res.id) {
        if (res.ok && !res.id) {
          console.error("createCaseAction: missing case id");
        }
        toast.error(
          res.ok
            ? "We couldn't finish creating the case. Please try again."
            : (res.error ?? "We couldn't create the case. Please try again.")
        );
        return;
      }
      const caseId = res.id;
      for (const uid of memberIds) {
        const add = await addCaseParticipantAction(organizationId, orgSlug, caseId, {
          userId: uid,
        });
        if (!add.ok) {
          toast.error(add.error ?? "Couldn't add someone to this case");
          router.push(`/${orgSlug}/cases/${caseId}`);
          router.refresh();
          setOpen(false);
          setMemberIds(new Set());
          return;
        }
      }
      toast.success(
        memberIds.size > 0
          ? "Case created — your team can open it now."
          : "Case created."
      );
      router.push(`/${orgSlug}/cases/${caseId}`);
      router.refresh();
      setOpen(false);
      setMemberIds(new Set());
      setShowMore(false);
    } finally {
      setSubmitting(false);
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
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setMemberIds(new Set());
            setShowMore(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create a case</DialogTitle>
            <DialogDescription>
              A <strong className="text-foreground">case</strong> groups related people, tasks, and
              follow-up in one place. Name it, add who should see it, then open optional details if
              you need them.
            </DialogDescription>
          </DialogHeader>
          <form action={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="case-title">Case name</Label>
              <Input
                id="case-title"
                name="title"
                required
                placeholder="e.g. Smith complaint, Q1 review"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="case-desc">What happened / who is involved</Label>
              <Textarea
                id="case-desc"
                name="description"
                rows={3}
                placeholder="Short summary for your team"
              />
            </div>
            {orgUsers.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <Label className="text-sm font-medium">Who can open this case</Label>
                <p className="text-xs text-muted-foreground">
                  Pick workspace members who should see this case. You can change this later from
                  the case page.
                </p>
                <ul className="max-h-40 space-y-2 overflow-y-auto pr-1">
                  {orgUsers.map((u) => (
                    <li key={u.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/80"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={memberIds.has(u.id)}
                          onChange={() => toggleMember(u.id)}
                          className="size-4 shrink-0 rounded border-input"
                        />
                        <span>{u.name ?? u.email ?? u.id}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Where things stand</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v as CaseStatus)}>
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

            <div className="rounded-lg border border-border/60">
              <button
                type="button"
                onClick={() => setShowMore((s) => !s)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted/50"
              >
                Official details (optional)
                {showMore ? (
                  <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </button>
              {showMore ? (
                <div className="space-y-4 border-t border-border/60 p-3">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      District, reference numbers, accused parties, and amounts — only if your
                      process needs them.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="case-district">District</Label>
                        <Input id="case-district" name="district" placeholder="Optional" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="crime_number">Reference / file number</Label>
                        <Input id="crime_number" name="crime_number" placeholder="Optional" />
                      </div>
                    </div>
                  </div>
                  <AccusedDetailsFields
                    key={open ? "case-form-open" : "case-form-closed"}
                    initialEntries={[""]}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="financial_impact">Amount involved (optional)</Label>
                    <Input
                      id="financial_impact"
                      name="financial_impact"
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g. 1200"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create case"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
