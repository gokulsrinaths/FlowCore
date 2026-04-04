import type { OrgRole } from "@/types";

/** Plain-language workspace roles for invites and team UI */
export function displayOrgRoleLabel(role: OrgRole): string {
  switch (role) {
    case "org_owner":
      return "Owner";
    case "org_admin":
      return "Admin";
    case "org_manager":
      return "Manager";
    case "org_worker":
      return "Member";
    default:
      return role;
  }
}
