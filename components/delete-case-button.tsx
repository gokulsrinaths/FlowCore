"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteCaseAction } from "@/app/actions/cases";
import { Button } from "@/components/ui/button";

type DeleteCaseButtonProps = {
  organizationId: string;
  orgSlug: string;
  caseId: string;
  caseTitle: string;
};

export function DeleteCaseButton({
  organizationId,
  orgSlug,
  caseId,
  caseTitle,
}: DeleteCaseButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    const ok = window.confirm(
      `Delete case "${caseTitle}"? Linked tasks will be unlinked (not deleted).`
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteCaseAction(organizationId, orgSlug, caseId);
      if (res.ok) {
        toast.success("Case deleted");
        router.push(`/${orgSlug}/cases`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not delete case");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full justify-center gap-2 text-destructive hover:text-destructive sm:w-auto"
      disabled={pending}
      onClick={onClick}
    >
      <Trash2 className="size-4" />
      Delete
    </Button>
  );
}
