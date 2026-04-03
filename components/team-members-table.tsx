"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { leaveOrganization, removeMember, updateMemberRole } from "@/app/actions/members";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { displayOrgRoleLabel } from "@/lib/org-role-labels";
import type { OrgMemberRow, OrgRole } from "@/types";

const ROLES: OrgRole[] = [
  "org_owner",
  "org_admin",
  "org_manager",
  "org_worker",
];

type TeamMembersTableProps = {
  members: OrgMemberRow[];
  currentUserId: string;
  organizationId: string;
  orgSlug: string;
  canManageRoles: boolean;
  canRemove: boolean;
  currentOrgRole: OrgRole;
};

export function TeamMembersTable({
  members,
  currentUserId,
  organizationId,
  orgSlug,
  canManageRoles,
  canRemove,
  currentOrgRole,
}: TeamMembersTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onRoleChange(userId: string, role: OrgRole) {
    startTransition(async () => {
      const res = await updateMemberRole(organizationId, orgSlug, userId, role);
      if (res.ok) {
        toast.success("Role updated");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not update role");
      }
    });
  }

  function onRemove(userId: string) {
    startTransition(async () => {
      const res = await removeMember(organizationId, orgSlug, userId);
      if (res.ok) {
        toast.success("Member removed");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not remove");
      }
    });
  }

  function onLeave() {
    startTransition(async () => {
      const res = await leaveOrganization(organizationId, orgSlug);
      if (res.ok) {
        toast.success("Left workspace");
        router.push("/onboarding");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not leave");
      }
    });
  }

  return (
    <div className="rounded-xl border border-border/80 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="w-[100px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">
                {u.name ?? "—"}
                {u.id === currentUserId && (
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    You
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {u.department?.trim() ? u.department : "—"}
              </TableCell>
              <TableCell>
                {canManageRoles && u.id !== currentUserId ? (
                  <Select
                    value={u.org_role}
                    onValueChange={(v) => {
                      if (v) onRoleChange(u.id, v as OrgRole);
                    }}
                    disabled={pending}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {displayOrgRoleLabel(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-sm">{displayOrgRoleLabel(u.org_role)}</span>
                )}
              </TableCell>
              <TableCell>
                {canRemove &&
                  u.id !== currentUserId &&
                  u.org_role !== "org_owner" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemove(u.id)}
                      disabled={pending}
                    >
                      Remove
                    </Button>
                  )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="p-4 border-t border-border/60">
        <Button type="button" variant="outline" size="sm" onClick={onLeave} disabled={pending}>
          Leave workspace
        </Button>
        {currentOrgRole === "org_owner" && (
          <p className="text-xs text-muted-foreground mt-2">
            Owners must transfer ownership before leaving if they are the sole owner.
          </p>
        )}
      </div>
    </div>
  );
}
