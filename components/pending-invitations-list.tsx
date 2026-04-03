"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  acceptInvitationAction,
  rejectInvitationAction,
} from "@/app/actions/invitations";
import { displayOrgRoleLabel } from "@/lib/org-role-labels";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PendingInvitationRow } from "@/types";

export function PendingInvitationsList({
  initial,
}: {
  initial: PendingInvitationRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [pending, start] = useTransition();

  function remove(id: string) {
    setRows((r) => r.filter((x) => x.id !== id));
  }

  function accept(id: string) {
    start(async () => {
      const res = await acceptInvitationAction(id);
      if (res.ok) {
        toast.success("Invitation accepted");
        remove(id);
        const path = res.slug ? `/${res.slug}/dashboard` : "/invitations";
        window.location.assign(path);
      } else {
        toast.error(res.error);
      }
    });
  }

  function reject(id: string) {
    start(async () => {
      const res = await rejectInvitationAction(id);
      if (res.ok) {
        toast.success("Invitation declined");
        remove(id);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No pending invitations</CardTitle>
          <CardDescription>
            When someone invites you to a workspace or case, it will show up here. You must
            accept before you are added.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((inv) => (
        <Card key={inv.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{inv.organization_name}</CardTitle>
            <CardDescription>
              {inv.case_title
                ? `Case: ${inv.case_title}`
                : "Workspace invitation"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Role</dt>
                <dd className="font-medium">{displayOrgRoleLabel(inv.role)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Invited email</dt>
                <dd className="font-mono text-xs break-all">{inv.email}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Invited by</dt>
                <dd>
                  {inv.invited_by_name || inv.invited_by_email || "—"}
                  {inv.invited_by_email ? (
                    <span className="text-muted-foreground text-xs ml-1">
                      ({inv.invited_by_email})
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize">{inv.status}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => accept(inv.id)}
              >
                Accept
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => reject(inv.id)}
              >
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
