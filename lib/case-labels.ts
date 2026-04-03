import type { CaseStatus } from "@/types";

/** Shared UI labels — safe to import from client components */
export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  open: "Open",
  active: "Active",
  under_investigation: "Under investigation",
  closed: "Closed",
};
