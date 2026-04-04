"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { assignItemToCaseAction } from "@/app/actions/cases";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none__";

export type CaseOption = { id: string; title: string };

type ItemCaseLinkProps = {
  organizationId: string;
  orgSlug: string;
  itemId: string;
  cases: CaseOption[];
  currentCaseId: string | null;
};

export function ItemCaseLink({
  organizationId,
  orgSlug,
  itemId,
  cases,
  currentCaseId,
}: ItemCaseLinkProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const value = currentCaseId ?? NONE;

  function onValueChange(next: string | null) {
    if (next == null) return;
    const caseId = next === NONE ? null : next;
    startTransition(async () => {
      const res = await assignItemToCaseAction(organizationId, orgSlug, itemId, caseId);
      if (res.ok) {
        toast.success(caseId ? "Linked to this case" : "Unlinked from case");
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn’t update the link");
      }
    });
  }

  if (cases.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No cases in this workspace yet.{" "}
        <a href={`/${orgSlug}/cases`} className="text-primary underline-offset-4 hover:underline">
          Create a case
        </a>{" "}
        to link tasks.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Case</Label>
      <Select value={value} onValueChange={onValueChange} disabled={pending}>
        <SelectTrigger>
          <SelectValue placeholder="No case" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No case</SelectItem>
          {cases.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
