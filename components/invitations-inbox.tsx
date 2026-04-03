"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  acceptInvitationAction,
  rejectInvitationAction,
} from "@/app/actions/invitations";
import { publicInviteUrl } from "@/lib/invite-link";
import { buttonVariants } from "@/lib/button-variants";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { InvitationInboxItem, UserInvitationsInbox } from "@/types";

function formatInvitedOn(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function statusLabel(s: InvitationInboxItem["status"]): string {
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

function InboxCard({
  inv,
  section,
  busy,
  onAccept,
  onReject,
  onCopy,
}: {
  inv: InvitationInboxItem;
  section: "pending" | "accepted" | "rejected";
  busy: boolean;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onCopy: (token: string) => void;
}) {
  const caseLine =
    inv.case_title?.trim() ? inv.case_title : "Workspace invitation (no case)";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{inv.org_name}</CardTitle>
        <CardDescription>Case: {caseLine}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium">{statusLabel(inv.status)}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">Invited on</dt>
            <dd>{formatInvitedOn(inv.created_at)}</dd>
          </div>
        </dl>

        {section === "pending" && inv.status === "invited" ? (
          <p className="text-sm text-muted-foreground">
            Please register with the invited email (or sign in) to respond.
          </p>
        ) : null}

        {section === "pending" && inv.status === "registered" ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              size="sm"
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={() => onAccept(inv.id)}
            >
              Accept
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={() => onReject(inv.id)}
            >
              Reject
            </Button>
            {inv.token ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={busy}
                onClick={() => onCopy(inv.token!)}
              >
                Copy invite link
              </Button>
            ) : null}
          </div>
        ) : null}

        {section === "accepted" ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <p className="text-sm font-medium text-muted-foreground">Joined</p>
            {inv.org_slug ? (
              <a
                href={`/${inv.org_slug}/dashboard`}
                className={cn(
                  buttonVariants({ size: "sm", variant: "secondary" }),
                  "inline-flex w-full justify-center sm:w-auto"
                )}
              >
                Open workspace
              </a>
            ) : null}
          </div>
        ) : null}

        {section === "rejected" ? (
          <p className="text-sm font-medium text-muted-foreground">Rejected</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function InvitationsInbox({ initial }: { initial: UserInvitationsInbox }) {
  const router = useRouter();
  const [groups, setGroups] = useState(initial);
  const [busy, start] = useTransition();

  function copyToken(token: string) {
    void navigator.clipboard.writeText(publicInviteUrl(token));
    toast.success("Invite link copied");
  }

  function accept(id: string) {
    start(async () => {
      const res = await acceptInvitationAction(id);
      if (res.ok) {
        toast.success("Invitation accepted");
        const path = res.slug ? `/${res.slug}/dashboard` : "/invitations";
        if (res.slug) {
          window.location.assign(path);
        } else {
          router.refresh();
        }
      } else {
        toast.error(res.error);
      }
    });
  }

  function reject(id: string) {
    start(async () => {
      const res = await rejectInvitationAction(id);
      if (res.ok) {
        toast.success("Invitation rejected");
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
          <CardTitle>You have no invitations</CardTitle>
          <CardDescription>
            When a workspace invites your email, invitations appear here. Use the same email to
            sign in, then accept or reject from this inbox.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Pending invitations</h2>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Invited</span> — not yet linked to your
            account. <span className="font-medium text-foreground">Registered</span> — you can
            accept or reject.
          </p>
        </div>
        {groups.pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <div className="space-y-4">
            {groups.pending.map((inv) => (
              <InboxCard
                key={inv.id}
                inv={inv}
                section="pending"
                busy={busy}
                onAccept={accept}
                onReject={reject}
                onCopy={copyToken}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Accepted invitations</h2>
        {groups.accepted.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <div className="space-y-4">
            {groups.accepted.map((inv) => (
              <InboxCard
                key={inv.id}
                inv={inv}
                section="accepted"
                busy={busy}
                onAccept={() => {}}
                onReject={() => {}}
                onCopy={copyToken}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Rejected invitations</h2>
        {groups.rejected.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <div className="space-y-4">
            {groups.rejected.map((inv) => (
              <InboxCard
                key={inv.id}
                inv={inv}
                section="rejected"
                busy={busy}
                onAccept={() => {}}
                onReject={() => {}}
                onCopy={copyToken}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
