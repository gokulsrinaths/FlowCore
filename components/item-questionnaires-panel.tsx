"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createItemQuestionnaireAction,
  deleteItemQuestionnaireAction,
  reviewItemQuestionnaireAction,
} from "@/app/actions/item-questionnaires";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import {
  canAdministerWorkspaceRecords,
  canCreateItemQuestionnaire,
  canManageItemQuestionnaires,
  ITEM_QUESTIONNAIRE_STATUS_LABELS,
} from "@/lib/permissions";
import type { ItemQuestionnaireRow, ItemWithUsers, OrgRole, UserRow } from "@/types";

function assigneeLabel(users: UserRow[], userId: string): string {
  const u = users.find((x) => x.id === userId);
  return u?.name ?? u?.email ?? userId;
}

export function ItemQuestionnairesPanel({
  rows,
  users,
  organizationId,
  orgSlug,
  item,
  orgRole,
  currentUserId,
}: {
  rows: ItemQuestionnaireRow[];
  users: UserRow[];
  organizationId: string;
  orgSlug: string;
  item: ItemWithUsers;
  orgRole: OrgRole;
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [questionText, setQuestionText] = useState("");
  const [description, setDescription] = useState("");
  const isWorkspaceAdmin = canAdministerWorkspaceRecords(orgRole);
  const teammates = useMemo(
    () => users.filter((u) => u.id !== currentUserId),
    [users, currentUserId]
  );
  const assignOptions = isWorkspaceAdmin ? users : teammates;
  const [assignTo, setAssignTo] = useState(assignOptions[0]?.id ?? "");
  const selectedAssignTo = assignOptions.some((t) => t.id === assignTo)
    ? assignTo
    : assignOptions[0]?.id ?? "";

  const canCreate = canCreateItemQuestionnaire(
    orgRole,
    { created_by: item.created_by, assigned_to: item.assigned_to },
    currentUserId
  );
  const canManage = canManageItemQuestionnaires(orgRole);
  const caseId = item.case_id ?? null;

  return (
    <div className="space-y-6">
      {canCreate && assignOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border/80 p-4">
          {isWorkspaceAdmin
            ? "Add people to this workspace under Team settings before assigning questionnaires."
            : "Add other people to this workspace under Team settings so you can assign questionnaires to them. You cannot assign a questionnaire to yourself."}
        </p>
      ) : null}

      {canCreate && assignOptions.length > 0 ? (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
          <h3 className="text-sm font-medium">Add questionnaire</h3>
          <p className="text-xs text-muted-foreground">
            {isWorkspaceAdmin
              ? "Assign to anyone on the team, including yourself if needed. Assignees get a notification (except when you assign to yourself). The item stays in "
              : "Pick someone on your team (not yourself). They get a notification and see it under Questionnaires. The item moves to "}
            <strong className="text-foreground">In progress</strong>
            {isWorkspaceAdmin
              ? " while questionnaires are open."
              : " until all questionnaires are done and reviewed."}
          </p>
          <div className="space-y-2">
            <Label htmlFor="nq-text">Question</Label>
            <Textarea
              id="nq-text"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="What do you need answered?"
              disabled={pending}
              className="min-h-[72px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nq-desc">Details (optional)</Label>
            <Input
              id="nq-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Context or links"
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label>Assign to</Label>
            <Select
              value={selectedAssignTo}
              onValueChange={(v) => {
                if (v) setAssignTo(v);
              }}
              disabled={pending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Member" />
              </SelectTrigger>
              <SelectContent>
                {assignOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.id === currentUserId ? `${u.name ?? u.email ?? u.id} (you)` : u.name ?? u.email ?? u.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={pending || !selectedAssignTo}
            onClick={() => {
              const q = questionText.trim();
              if (!q) {
                toast.error("Add question text first");
                return;
              }
              start(async () => {
                const res = await createItemQuestionnaireAction(
                  organizationId,
                  orgSlug,
                  item.id,
                  q,
                  description.trim(),
                  selectedAssignTo,
                  caseId
                );
                if (res.ok) {
                  toast.success("Task question added");
                  setQuestionText("");
                  setDescription("");
                  router.refresh();
                } else toast.error(res.error);
              });
            }}
          >
            Add questionnaire
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No questionnaires on this item yet.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-border/70 p-3 space-y-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{row.question_text}</span>
                <Badge variant="outline">{ITEM_QUESTIONNAIRE_STATUS_LABELS[row.status]}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Assigned to {assigneeLabel(users, row.assigned_to_user_id)}
              </p>
              {row.description ? (
                <p className="text-muted-foreground whitespace-pre-wrap">{row.description}</p>
              ) : null}
              {row.answer_text ? (
                <div className="rounded-md bg-muted/50 p-2 text-xs whitespace-pre-wrap">
                  {row.answer_text}
                </div>
              ) : null}

              {canManage && row.status === "under_review" ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    disabled={pending}
                    onClick={() => {
                      start(async () => {
                        const res = await reviewItemQuestionnaireAction(
                          organizationId,
                          orgSlug,
                          row.id,
                          item.id,
                          true,
                          caseId
                        );
                        if (res.ok) {
                          toast.success("Answer approved");
                          router.refresh();
                        } else toast.error(res.error);
                      });
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      start(async () => {
                        const res = await reviewItemQuestionnaireAction(
                          organizationId,
                          orgSlug,
                          row.id,
                          item.id,
                          false,
                          caseId
                        );
                        if (res.ok) {
                          toast.success("Sent back for changes");
                          router.refresh();
                        } else toast.error(res.error);
                      });
                    }}
                  >
                    Send back
                  </Button>
                </div>
              ) : null}

              {canManage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={pending}
                  onClick={() => {
                    start(async () => {
                      const res = await deleteItemQuestionnaireAction(
                        organizationId,
                        orgSlug,
                        row.id,
                        item.id,
                        caseId
                      );
                      if (res.ok) {
                        toast.success("Removed from task");
                        router.refresh();
                      } else toast.error(res.error);
                    });
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
