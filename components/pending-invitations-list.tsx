"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  acceptInvitationAction,
  rejectInvitationAction,
} from "@/app/actions/invitations";
import { displayOrgRoleLabel } from "@/lib/org-role-labels";
import { publicInviteUrl } from "@/lib/invite-link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { InvitationListRow, UserInvitationsGrouped } from "@/types";

function statusLabel(s: InvitationListRow["status"]): string {
  switch (s) {
    case "invited":
      return "Invited";
    case "registered":
      return "Registered";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    default:
      return s;
  }
}

function InvitationCard({
  inv,
  pending,
  onAccept,
  onReject,
  onCopy,
}: {
  inv: InvitationListRow;
  pending: boolean;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onCopy: (token: string) => void;
}) {
  const canAct = inv.status === "registered";
  return (
    <Card>
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
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Address → status</dt>
            <dd className="text-sm">
              <span className="font-mono text-xs break-all">{inv.email}</span>
              <span className="text-muted-foreground"> → {statusLabel(inv.status)}</span>
            </dd>
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
        </dl>
        <div className="flex flex-wrap gap-2">
          {canAct ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => onAccept(inv.id)}
              >
                Accept
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => onReject(inv.id)}
              >
                Reject
              </Button>
            </>
          ) : null}
          {inv.token ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => onCopy(inv.token)}
            >
              Copy invite link
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function PendingInvitationsList({
  initial,
}: {
  initial: UserInvitationsGrouped;
}) {
  const router = useRouter();
  const [groups, setGroups] = useState(initial);
  const [pending, start] = useTransition();

  function copyLink(token: string) {
    const url = publicInviteUrl(token);
    void navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  }

  function removeFromPending(id: string) {
    setGroups((g) => ({
      ...g,
      pending: g.pending.filter((x) => x.id !== id),
    }));
  }

  function removeFromAccepted(id: string) {
    setGroups((g) => ({
      ...g,
      accepted: g.accepted.filter((x) => x.id !== id),
    }));
  }

  function accept(id: string) {
    start(async () => {
      const res = await acceptInvitationAction(id);
      if (res.ok) {
        toast.success("Invitation accepted");
        removeFromPending(id);
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
        setGroups((g) => {
          const row = g.pending.find((x) => x.id === id);
          return {
            pending: g.pending.filter((x) => x.id !== id),
            accepted: g.accepted,
            rejected: row
              ? [{ ...row, status: "rejected" as const }, ...g.rejected]
              : g.rejected,
          };
        });
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const hasAny =
    groups.pending.length > 0 ||
    groups.accepted.length > 0 ||
    groups.rejected.length > 0;

  if (!hasAny) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No invitations</CardTitle>
          <CardDescription>
            When someone invites you to a workspace or case, it will show up here. Sign in with
            the invited email to move from invited to registered, then accept to join.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Pending</h2>
          <p className="text-sm text-muted-foreground text-pretty">
            Invited + registered (same inbox). Sign in with the invited email to become registered,
            then use Accept or Reject when status is Registered.
          </p>
        </div>
        {groups.pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">None right now.</p>
        ) : (
          <div className="space-y-4">
            {groups.pending.map((inv) => (
              <InvitationCard
                key={inv.id}
                inv={inv}
                pending={pending}
                onAccept={accept}
                onReject={reject}
                onCopy={copyLink}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Accepted</h2>
        {groups.accepted.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <div className="space-y-4">
            {groups.accepted.map((inv) => (
              <InvitationCard
                key={inv.id}
                inv={inv}
                pending={pending}
                onAccept={() => {}}
                onReject={() => {}}
                onCopy={copyLink}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Rejected</h2>
        {groups.rejected.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <div className="space-y-4">
            {groups.rejected.map((inv) => (
              <InvitationCard
                key={inv.id}
                inv={inv}
                pending={pending}
                onAccept={() => {}}
                onReject={() => {}}
                onCopy={copyLink}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
