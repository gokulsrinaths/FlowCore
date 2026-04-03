import { Badge } from "@/components/ui/badge";
import { CASE_STATUS_LABELS } from "@/lib/case-labels";
import type { CaseStatus } from "@/types";
import { cn } from "@/lib/utils";

const VARIANT: Partial<Record<CaseStatus, "default" | "secondary" | "outline" | "destructive">> =
  {
    open: "secondary",
    active: "default",
    under_investigation: "outline",
    closed: "outline",
  };

export function CaseStatusBadge({
  status,
  className,
}: {
  status: CaseStatus;
  className?: string;
}) {
  return (
    <Badge variant={VARIANT[status] ?? "secondary"} className={cn("font-normal", className)}>
      {CASE_STATUS_LABELS[status]}
    </Badge>
  );
}
