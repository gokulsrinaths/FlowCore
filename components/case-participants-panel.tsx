"use client";

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
import type { CaseParticipant, OrgRole, UserRow } from "@/types";

const NONE_USER = "__none__";
const ALL_DEPTS = "__all__";

const ROLE_LABEL: Record<string, string> = {
  sp: "SP",
  dsp: "DSP",
  officer: "Officer",
  external: "External",
};

const INVITE_ROLES: OrgRole[] = ["org_worker", "org_manager", "org_admin"];

function internalLine(p: CaseParticipant) {
  const name = p.user_name ?? p.user_email ?? p.user_id ?? "—";
  const dept = p.department?.trim();
  return (
    <span>
      {name}
      {dept ? <span className="text-muted-foreground"> · {dept}</span> : null}
    </span>
  );
}

function externalStatus(p: CaseParticipant) {
  if (p.invited) return "Invited";
  return "Active";
}

type CaseParticipantsPanelProps = {
  organizationId: string;
  orgSlug: string;
  caseId: string;
  participants: CaseParticipant[];
  orgUsers: UserRow[];
};

export function CaseParticipantsPanel({
  organizationId,
  orgSlug,
  caseId,
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
      toast.error("Select a workspace member");
      return;
    }
    startTransition(async () => {
      const res = await addCaseParticipantAction(organizationId, orgSlug, caseId, {
        userId: addUserId,
      });
      if (res.ok) {
        toast.success("Participant added");
        setAddUserId(NONE_USER);
        refresh();
      } else toast.error(res.error ?? "Could not add");
    });
  }

  function addExternal() {
    if (!extEmail.trim()) {
      toast.error("Enter an email");
      return;
    }
    startTransition(async () => {
      const res = await addCaseParticipantAction(organizationId, orgSlug, caseId, {
        email: extEmail.trim(),
      });
      if (res.ok) {
        toast.success("External participant added");
        setExtEmail("");
        refresh();
      } else toast.error(res.error ?? "Could not add");
    });
  }

  function sendCaseInvite() {
    if (!inviteEmail.trim()) {
      toast.error("Enter an email");
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
        if (res.emailSent === false) {
          toast.error(
            res.emailError
              ? `Invite saved but email failed: ${res.emailError}`
              : "Invite saved but email was not sent (check RESEND_API_KEY)."
          );
        } else {
          toast.success("Invitation sent");
        }
        setInviteEmail("");
        refresh();
      } else toast.error(res.error ?? "Could not send invite");
    });
  }

  function submitRequisition(e: React.FormEvent) {
    e.preventDefault();
    if (!reqEmail.trim()) {
      toast.error("Enter an email");
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
        toast.success("Requisition recorded");
        setReqEmail("");
        setReqDesc("");
        refresh();
      } else toast.error(res.error ?? "Could not save");
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await removeCaseParticipantAction(organizationId, orgSlug, caseId, id);
      if (res.ok) {
        toast.success("Removed");
        refresh();
      } else toast.error(res.error ?? "Could not remove");
    });
  }

  const internal = participants.filter((p) => p.type === "internal");
  const external = participants.filter((p) => p.type === "external");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Participants</CardTitle>
        <CardDescription>
          Internal roster (SP / DSP / Officer) and external contacts for this case.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="text-sm font-medium mb-2">SP</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              {internal.filter((p) => p.role === "sp").length === 0 ? (
                <li>—</li>
              ) : (
                internal
                  .filter((p) => p.role === "sp")
                  .map((p) => (
                    <li key={p.id} className="flex justify-between gap-2 items-start">
                      <span className="min-w-0">{internalLine(p)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs shrink-0"
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
            <h4 className="text-sm font-medium mb-2">DSP</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              {internal.filter((p) => p.role === "dsp").length === 0 ? (
                <li>—</li>
              ) : (
                internal
                  .filter((p) => p.role === "dsp")
                  .map((p) => (
                    <li key={p.id} className="flex justify-between gap-2 items-start">
                      <span className="min-w-0">{internalLine(p)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs shrink-0"
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
                  <li key={p.id} className="flex justify-between gap-2 items-start">
                    <span className="min-w-0">{internalLine(p)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs shrink-0"
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
          <h4 className="text-sm font-medium mb-2">External</h4>
          <ul className="text-sm space-y-1">
            {external.length === 0 ? (
              <li className="text-muted-foreground">—</li>
            ) : (
              external.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 items-center">
                  <span className="min-w-0">
                    {p.email}
                    <span className="text-muted-foreground text-xs ml-2">
                      {ROLE_LABEL[p.role ?? "external"] ?? "External"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <Badge variant={p.invited ? "outline" : "secondary"} className="text-[10px]">
                      {externalStatus(p)}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
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
            Creates a case participant, an organization invitation, and an activity log. When they
            sign up with this email, they join the workspace and this case automatically.
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
              <Label>Org role when they join</Label>
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
                      {r.replace("org_", "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={sendCaseInvite} disabled={pending}>
              Send invite
            </Button>
          </div>
        </div>

        <div className="border-t border-border/60 pt-4 space-y-3">
          <h4 className="text-sm font-medium">Add participant</h4>
          {departments.length > 0 && (
            <div className="space-y-2 max-w-xs">
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
              <Label>Internal (workspace member)</Label>
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
              <Label>External email</Label>
              <Input
                value={extEmail}
                onChange={(e) => setExtEmail(e.target.value)}
                placeholder="name@example.com"
                type="email"
              />
            </div>
            <Button type="button" variant="secondary" onClick={addExternal} disabled={pending}>
              Add email
            </Button>
          </div>
        </div>

        <form onSubmit={submitRequisition} className="border-t border-border/60 pt-4 space-y-3">
          <h4 className="text-sm font-medium">Add requisition / email</h4>
          <p className="text-xs text-muted-foreground">
            Records the participant and logs that an email was sent (no mailer yet).
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
          <Button type="submit" variant="outline" disabled={pending}>
            Save requisition
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
