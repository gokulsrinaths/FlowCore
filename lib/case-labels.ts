import type { CaseStatus } from "@/types";

/** Shared UI labels — safe to import from client components */
export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  open: "New",
  active: "In progress",
  under_investigation: "Needs review",
  closed: "Done",
};
