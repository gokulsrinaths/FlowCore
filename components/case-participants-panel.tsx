"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addCaseParticipantAction,
  addRequisitionFlowAction,
  createCaseInvitationAction,
  removeCaseParticipantAction,
} from "@/app/actions/participants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { publicInviteUrl } from "@/lib/invite-link";
import { generateInviteMailto } from "@/lib/mailto";
import { displayOrgRoleLabel } from "@/lib/org-role-labels";
import type { CaseParticipant, OrgRole, UserRow } from "@/types";

const NONE_USER = "__none__";
const ALL_DEPTS = "__all__";

const ROLE_LABEL: Record<string, string> = {
  sp: "Supervising",
  dsp: "Deputy",
  officer: "Officer",
  external: "Guest",
};

const INVITE_ROLES: OrgRole[] = ["org_worker", "org_manager", "org_admin"];

/** Pending invite row: Email → Invited / Email → Registered / Name → Registered */
function pendingParticipantLabel(p: CaseParticipant): string {
  const st = p.invite_status;
  if (st === "invited") {
    const id =
      p.type === "external"
        ? (p.email?.trim() ?? "")
        : (p.user_name ?? p.user_email ?? p.email ?? "").trim();
    return id ? `${id} — invite sent` : "Invite sent";
  }
  if (st === "registered") {
    if (p.type === "internal") {
      const n = (p.user_name ?? p.user_email ?? "Teammate").trim();
      return `${n} — signed up, waiting to join case`;
    }
    const em = p.email?.trim() ?? "";
    return em ? `${em} — signed up, waiting to join case` : "Waiting to join case";
  }
  return p.email?.trim() || p.user_email || "—";
}

/** Roster internal line with Name → Accepted / Name → Rejected when invitation closed */
function internalRosterLine(p: CaseParticipant): ReactNode {
  const name = p.user_name ?? p.user_email ?? p.user_id ?? "—";
  const dept = p.department?.trim();
  const st = p.invite_status;
  const suffix =
    st === "accepted" ? " — on this case" : st === "rejected" ? " — declined" : "";
  return (
    <span>
      {name}
      {suffix ? <span className="text-muted-foreground">{suffix}</span> : null}
      {dept ? <span className="text-muted-foreground"> · {dept}</span> : null}
    </span>
  );
}

type CaseParticipantsPanelProps = {
  organizationId: string;
  orgSlug: string;
  caseId: string;
  caseTitle: string;
  orgName: string;
  participants: CaseParticipant[];
  orgUsers: UserRow[];
};

function openExternalInviteMailto(
  p: CaseParticipant,
  caseTitle: string,
  orgName: string
): void {
  const to = p.email?.trim();
  if (!to) {
    toast.error("No email address for this person");
    return;
  }
  const inviteLink = p.invite_token?.trim()
    ? publicInviteUrl(p.invite_token)
    : `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") || window.location.origin}/invitations`;
  window.location.href = generateInviteMailto({ to, inviteLink, caseTitle, orgName });
}

function copyExternalInviteLink(p: CaseParticipant): void {
  const tok = p.invite_token?.trim();
  if (!tok) {
    toast.error("No invite link is available yet");
    return;
  }
  void navigator.clipboard.writeText(publicInviteUrl(tok));
  toast.success("Link copied");
}

export function CaseParticipantsPanel({
  organizationId,
  orgSlug,
  caseId,
  caseTitle,
  orgName,
  participants,
  orgUsers,
}: CaseParticipantsPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addUserId, setAddUserId] = useState(NONE_USER);
  const [extEmail, setExtEmail] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqDesc, setReqDesc] = useState("");
  const [deptFilter, setDeptFilter] = useState(ALL_DEPTS);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("org_worker");

  const departments = useMemo(() => {
    const s = new Set<string>();
    for (const u of orgUsers) {
      const d = u.department?.trim();
      if (d) s.add(d);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [orgUsers]);

  const filteredOrgUsers = useMemo(() => {
    if (deptFilter === ALL_DEPTS) return orgUsers;
    return orgUsers.filter((u) => (u.department ?? "").trim() === deptFilter);
  }, [orgUsers, deptFilter]);

  function refresh() {
    router.refresh();
  }

  function addInternal() {
    if (addUserId === NONE_USER) {
      toast.error("Choose someone from the list");
      return;
    }
    startTransition(async () => {
      const res = await addCaseParticipantAction(organizationId, orgSlug, caseId, {
        userId: addUserId,
      });
      if (res.ok) {
        toast.success("Added to this case");
        setAddUserId(NONE_USER);
        refresh();
      } else toast.error(res.error ?? "Couldn’t add them");
    });
  }

  function addExternal() {
    if (!extEmail.trim()) {
      toast.error("Enter an email address");
      return;
    }
    startTransition(async () => {
      const res = await addCaseParticipantAction(organizationId, orgSlug, caseId, {
        email: extEmail.trim(),
      });
      if (res.ok) {
        toast.success("Guest added to this case");
        setExtEmail("");
        refresh();
      } else toast.error(res.error ?? "Couldn’t add them");
    });
  }

  function sendCaseInvite() {
    if (!inviteEmail.trim()) {
      toast.error("Enter an email address");
      return;
    }
    startTransition(async () => {
      const res = await createCaseInvitationAction(
        organizationId,
        orgSlug,
        caseId,
        inviteEmail.trim(),
        inviteRole
      );
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
        setInviteEmail("");
        refresh();
      } else toast.error(res.error ?? "Couldn’t create the invite");
    });
  }

  function submitRequisition(e: React.FormEvent) {
    e.preventDefault();
    if (!reqEmail.trim()) {
      toast.error("Enter an email address");
      return;
    }
    startTransition(async () => {
      const res = await addRequisitionFlowAction(
        organizationId,
        orgSlug,
        caseId,
        reqEmail.trim(),
        reqDesc
      );
      if (res.ok) {
        toast.success("Saved");
        setReqEmail("");
        setReqDesc("");
        refresh();
      } else toast.error(res.error ?? "Couldn’t save");
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await removeCaseParticipantAction(organizationId, orgSlug, caseId, id);
      if (res.ok) {
        toast.success("Removed from case");
        refresh();
      } else toast.error(res.error ?? "Couldn’t remove");
    });
  }

  const pendingCaseInvite = participants.filter((p) => {
    const st = p.invite_status;
    return st === "invited" || st === "registered";
  });

  const internal = participants.filter((p) => {
    if (p.type !== "internal") return false;
    const st = p.invite_status;
    if (st === "invited" || st === "registered") return false;
    return true;
  });

  const external = participants.filter((p) => {
    if (p.type !== "external") return false;
    const st = p.invite_status;
    if (st === "invited" || st === "registered") return false;
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">People on this case</CardTitle>
        <CardDescription>
          Workspace teammates and outside contacts who can see and work this case.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="text-sm font-medium mb-2">Supervising</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              {internal.filter((p) => p.role === "sp").length === 0 ? (
                <li>—</li>
              ) : (
                internal
                  .filter((p) => p.role === "sp")
                  .map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <span className="min-w-0">{internalRosterLine(p)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto min-h-10 self-start py-2 text-xs sm:h-7 sm:min-h-0 sm:py-0"
                        disabled={pending}
                        onClick={() => remove(p.id)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))
              )}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-2">Deputy</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              {internal.filter((p) => p.role === "dsp").length === 0 ? (
                <li>—</li>
              ) : (
                internal
                  .filter((p) => p.role === "dsp")
                  .map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <span className="min-w-0">{internalRosterLine(p)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto min-h-10 self-start py-2 text-xs sm:h-7 sm:min-h-0 sm:py-0"
                        disabled={pending}
                        onClick={() => remove(p.id)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))
              )}
            </ul>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Officers</h4>
          <ul className="text-sm space-y-1 text-muted-foreground">
            {internal.filter((p) => p.role === "officer").length === 0 ? (
              <li>—</li>
            ) : (
              internal
                .filter((p) => p.role === "officer")
                .map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <span className="min-w-0">{internalRosterLine(p)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto min-h-10 self-start py-2 text-xs sm:h-7 sm:min-h-0 sm:py-0"
                      disabled={pending}
                      onClick={() => remove(p.id)}
                    >
                      Remove
                    </Button>
                  </li>
                ))
            )}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Waiting to join</h4>
          <p className="text-xs text-muted-foreground mb-2">
            People who were invited or signed up but haven’t joined this case yet.
          </p>
          <ul className="text-sm space-y-1">
            {pendingCaseInvite.length === 0 ? (
              <li className="text-muted-foreground">—</li>
            ) : (
              pendingCaseInvite.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-3 border-b border-border/40 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-2 sm:border-0 sm:pb-0"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{pendingParticipantLabel(p)}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {ROLE_LABEL[p.role ?? "external"] ?? "External"}
                    </span>
                  </span>
                  <span className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                    {p.type === "external" && p.email?.trim() ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-auto min-h-10 w-full py-2 text-xs sm:w-auto sm:py-0"
                          disabled={pending}
                          onClick={() => openExternalInviteMailto(p, caseTitle, orgName)}
                        >
                          Open email draft
                        </Button>
                        {p.invite_token?.trim() ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-auto min-h-10 w-full py-2 text-xs sm:w-auto sm:py-0"
                            disabled={pending}
                            onClick={() => copyExternalInviteLink(p)}
                          >
                            Copy invite link
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto min-h-10 w-full py-2 text-xs sm:w-auto sm:py-0"
                      disabled={pending}
                      onClick={() => remove(p.id)}
                    >
                      Remove
                    </Button>
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Outside contacts</h4>
          <ul className="text-sm space-y-1">
            {external.length === 0 ? (
              <li className="text-muted-foreground">—</li>
            ) : (
              external.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-3 border-b border-border/40 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-2 sm:border-0 sm:pb-0"
                >
                  <span className="min-w-0">
                    <span className="font-medium">
                      {p.invite_status === "rejected" && p.email
                        ? `${p.email} → Rejected`
                        : (p.email ?? "—")}
                    </span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {ROLE_LABEL[p.role ?? "external"] ?? "External"}
                    </span>
                  </span>
                  <span className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                    <Badge variant="secondary" className="w-fit text-[10px]">
                      On case
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto min-h-10 w-full py-2 text-xs sm:w-auto sm:py-0"
                      disabled={pending}
                      onClick={() => openExternalInviteMailto(p, caseTitle, orgName)}
                    >
                      Open email draft
                    </Button>
                    {p.invite_token?.trim() ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-auto min-h-10 w-full py-2 text-xs sm:w-auto sm:py-0"
                        disabled={pending}
                        onClick={() => copyExternalInviteLink(p)}
                      >
                        Copy invite link
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto min-h-10 w-full py-2 text-xs sm:w-auto sm:py-0"
                      disabled={pending}
                      onClick={() => remove(p.id)}
                    >
                      Remove
                    </Button>
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="border-t border-border/60 pt-4 space-y-3">
          <h4 className="text-sm font-medium">Invite by email</h4>
          <p className="text-xs text-muted-foreground">
            We’ll create an invite they open in their browser. Share the link with them. They need to
            sign in with that email and accept from <strong className="text-foreground">Invites</strong>{" "}
            before they’re fully on this case.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 items-end">
            <div className="flex-1 space-y-2 w-full">
              <Label htmlFor="case-invite-email">Email</Label>
              <Input
                id="case-invite-email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@example.com"
                type="email"
              />
            </div>
            <div className="w-full sm:w-44 space-y-2">
              <Label>Workspace role when they join</Label>
              <Select
                value={inviteRole}
                onValueChange={(v) => v && setInviteRole(v as OrgRole)}
                disabled={pending}
              >
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
            <Button
              type="button"
              className="w-full shrink-0 sm:w-auto"
              onClick={sendCaseInvite}
              disabled={pending}
            >
              Send invite
            </Button>
          </div>
        </div>

        <div className="border-t border-border/60 pt-4 space-y-3">
          <h4 className="text-sm font-medium">Add someone now</h4>
          {departments.length > 0 && (
            <div className="w-full max-w-full space-y-2 sm:max-w-xs">
              <Label>Filter by department</Label>
              <Select value={deptFilter} onValueChange={(v) => setDeptFilter(v ?? ALL_DEPTS)}>
                <SelectTrigger>
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_DEPTS}>All departments</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 items-end">
            <div className="flex-1 space-y-2 w-full">
              <Label>Someone already in the workspace</Label>
              <Select
                value={addUserId}
                onValueChange={(v) => setAddUserId(v ?? NONE_USER)}
                disabled={pending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_USER}>Choose…</SelectItem>
                  {filteredOrgUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name ?? u.email ?? u.id}
                      {u.department?.trim() ? ` · ${u.department}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={addInternal} disabled={pending}>
              Add
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-end">
            <div className="flex-1 space-y-2 w-full">
              <Label>Guest by email</Label>
              <Input
                value={extEmail}
                onChange={(e) => setExtEmail(e.target.value)}
                placeholder="name@example.com"
                type="email"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full shrink-0 sm:w-auto"
              onClick={addExternal}
              disabled={pending}
            >
              Add guest
            </Button>
          </div>
        </div>

        <form onSubmit={submitRequisition} className="border-t border-border/60 pt-4 space-y-3">
          <h4 className="text-sm font-medium">Log an outreach (optional)</h4>
          <p className="text-xs text-muted-foreground">
            Keeps a note in FlowCore only. To send a real email, use <strong className="text-foreground">Open email draft</strong>{" "}
            on a person’s row above.
          </p>
          <div className="space-y-2">
            <Label htmlFor="req-email">Email</Label>
            <Input
              id="req-email"
              value={reqEmail}
              onChange={(e) => setReqEmail(e.target.value)}
              type="email"
              required
              placeholder="Recipient"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="req-desc">Description</Label>
            <Textarea
              id="req-desc"
              value={reqDesc}
              onChange={(e) => setReqDesc(e.target.value)}
              rows={2}
              placeholder="Brief note"
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={pending}
          >
            Save note
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
