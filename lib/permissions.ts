import type { ItemStatus, OrgRole, UserRole } from "@/types";

/** Ordered workflow columns for UI and validation */
export const STATUS_ORDER: ItemStatus[] = [
  "created",
  "in_progress",
  "under_review",
  "completed",
];

export const STATUS_LABELS: Record<ItemStatus, string> = {
  created: "Created",
  in_progress: "In Progress",
  under_review: "Under Review",
  completed: "Completed",
};

/**
 * Map org role → workflow engine role (mirrors flowcore_org_workflow_role in SQL).
 */
export function orgRoleToWorkflowRole(role: OrgRole): UserRole {
  if (role === "org_owner" || role === "org_admin") return "admin";
  if (role === "org_manager") return "manager";
  return "worker";
}

/**
 * Strict rules (mirrors public.flowcore_can_transition in SQL).
 */
export function canChangeStatus(
  workflowRole: UserRole,
  from: ItemStatus,
  to: ItemStatus
): boolean {
  if (from === to) return true;
  if (workflowRole === "admin") return true;

  if (workflowRole === "manager") {
    return (
      (from === "under_review" && to === "completed") ||
      (from === "under_review" && to === "in_progress")
    );
  }

  if (workflowRole === "worker") {
    return (
      (from === "created" && to === "in_progress") ||
      (from === "in_progress" && to === "under_review")
    );
  }

  return false;
}

export function canAssign(orgRole: OrgRole): boolean {
  return (
    orgRole === "org_owner" ||
    orgRole === "org_admin" ||
    orgRole === "org_manager"
  );
}

/** Dropdown options for status control — only valid next stages for the workflow role */
export function allowedNextStatuses(
  workflowRole: UserRole,
  current: ItemStatus
): ItemStatus[] {
  if (workflowRole === "admin") {
    return STATUS_ORDER;
  }
  if (workflowRole === "manager") {
    const next = new Set<ItemStatus>([current]);
    if (current === "under_review") {
      next.add("completed");
      next.add("in_progress");
    }
    return STATUS_ORDER.filter((s) => next.has(s));
  }
  const next: ItemStatus[] = [current];
  if (current === "created") next.push("in_progress");
  if (current === "in_progress") next.push("under_review");
  return [...new Set(next)];
}

export function canEditItem(
  orgRole: OrgRole,
  item: { created_by: string | null; assigned_to: string | null },
  userId: string
): boolean {
  const w = orgRoleToWorkflowRole(orgRole);
  if (w === "admin" || w === "manager") return true;
  return item.created_by === userId || item.assigned_to === userId;
}

export function canDeleteItem(
  orgRole: OrgRole,
  item: { created_by: string | null },
  userId: string
): boolean {
  const w = orgRoleToWorkflowRole(orgRole);
  if (w === "admin") return true;
  return item.created_by === userId;
}

export function canManageTeam(orgRole: OrgRole): boolean {
  return orgRole === "org_owner" || orgRole === "org_admin";
}

export function canInvite(orgRole: OrgRole): boolean {
  return orgRole === "org_owner" || orgRole === "org_admin";
}

/** Matches flowcore_delete_case — owners and admins only */
export function canDeleteCase(orgRole: OrgRole): boolean {
  return orgRole === "org_owner" || orgRole === "org_admin";
}
