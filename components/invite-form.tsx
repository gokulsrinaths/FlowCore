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

/** Same order as case “Invite by email” role list */
const INVITE_ROLES: OrgRole[] = ["org_worker", "org_manager", "org_admin"];

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
        toast.success("Invite ready — share the link with them.");
        if (res.inviteUrl) {
          try {
            await navigator.clipboard.writeText(res.inviteUrl);
            toast.message("Link copied");
          } catch {
            /* ignore */
          }
        }
        setEmail("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn’t send that invite");
      }
    });
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2 w-full">
          <Label htmlFor="invite-email">Their email</Label>
          <Input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            disabled={pending}
          />
        </div>
        <div className="w-full space-y-2 sm:w-44">
          <Label htmlFor="invite-role">Workspace role when they join</Label>
          <Select
            value={role}
            onValueChange={(v) => setRole(v as OrgRole)}
            disabled={pending}
          >
            <SelectTrigger id="invite-role">
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
        <Button
          type="submit"
          className="w-full shrink-0 sm:w-auto"
          disabled={pending}
        >
          {pending ? "Sending…" : "Send invite"}
        </Button>
      </div>
    </form>
  );
}
