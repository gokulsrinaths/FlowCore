import type { OrgRole } from "@/types";

/** UI labels for investigation-style deployments — internal roles unchanged */
export function displayOrgRoleLabel(role: OrgRole): string {
  switch (role) {
    case "org_owner":
    case "org_admin":
      return "SP";
    case "org_manager":
      return "DSP";
    case "org_worker":
      return "Officer";
    default:
      return role;
  }
}
