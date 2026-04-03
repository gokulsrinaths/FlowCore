"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createInvitationAction } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { displayOrgRoleLabel } from "@/lib/org-role-labels";
import type { OrgRole } from "@/types";

const INVITE_ROLES: OrgRole[] = ["org_admin", "org_manager", "org_worker"];

export function InviteForm({
  organizationId,
  orgSlug,
}: {
  organizationId: string;
  orgSlug: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("org_worker");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("role", role);
      const res = await createInvitationAction(organizationId, orgSlug, fd);
      if (res.ok) {
        toast.success("Invitation created — share the link manually with your teammate.");
        if (res.inviteUrl) {
          try {
            await navigator.clipboard.writeText(res.inviteUrl);
            toast.message("Invite link copied to clipboard");
          } catch {
            /* ignore */
          }
        }
        setEmail("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not invite");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-md">
      <div className="space-y-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@company.com"
        />
      </div>
      <div className="space-y-2">
        <Label>Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INVITE_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {displayOrgRoleLabel(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create invite"}
      </Button>
    </form>
  );
}
