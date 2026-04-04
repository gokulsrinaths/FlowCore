"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  acceptItemQuestionnaireAction,
  submitItemQuestionnaireAnswerAction,
} from "@/app/actions/item-questionnaires";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { buttonVariants } from "@/lib/button-variants";
import { ITEM_QUESTIONNAIRE_STATUS_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { MyItemQuestionnaireRow } from "@/types";

export function MyQuestionnairesList({
  rows,
  organizationId,
  orgSlug,
}: {
  rows: MyItemQuestionnaireRow[];
  organizationId: string;
  orgSlug: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (rows.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Nothing here yet</CardTitle>
          <CardDescription>
            A <strong className="text-foreground">task question</strong> is extra information
            someone needs on a specific task. When you’re assigned one, it will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={`/${orgSlug}/items`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex")}
          >
            Go to task board
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <li
          key={row.id}
          className="rounded-xl border border-border/80 bg-card/40 p-4 shadow-sm space-y-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <Link
                href={`/${orgSlug}/items/${row.item_id}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {row.item_title || "Task"}
              </Link>
              {row.case_id ? (
                <p className="text-xs text-muted-foreground">
                  Case:{" "}
                  <Link
                    href={`/${orgSlug}/cases/${row.case_id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Open case
                  </Link>
                </p>
              ) : null}
            </div>
            <Badge variant="secondary" className="shrink-0">
              {ITEM_QUESTIONNAIRE_STATUS_LABELS[row.status]}
            </Badge>
          </div>
          <p className="text-sm font-medium">{row.question_text}</p>
          {row.description ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{row.description}</p>
          ) : null}

          {row.status === "pending_accept" ? (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => {
                start(async () => {
                  const res = await acceptItemQuestionnaireAction(
                    organizationId,
                    orgSlug,
                    row.id,
                    row.item_id,
                    row.case_id
                  );
                  if (res.ok) {
                    toast.success("You’re set — answer when you’re ready");
                    router.refresh();
                  } else toast.error(res.error);
                });
              }}
            >
              Accept
            </Button>
          ) : null}

          {row.status === "in_progress" ? (
            <div className="space-y-2">
              <Textarea
                placeholder="Your answer…"
                className="min-h-[100px]"
                value={drafts[row.id] ?? row.answer_text ?? ""}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [row.id]: e.target.value }))
                }
                disabled={pending}
              />
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => {
                  const text = (drafts[row.id] ?? row.answer_text ?? "").trim();
                  if (!text) {
                    toast.error("Add an answer first");
                    return;
                  }
                  start(async () => {
                    const res = await submitItemQuestionnaireAnswerAction(
                      organizationId,
                      orgSlug,
                      row.id,
                      row.item_id,
                      text,
                      row.case_id
                    );
                    if (res.ok) {
                      toast.success("Sent for review");
                      router.refresh();
                    } else toast.error(res.error);
                  });
                }}
              >
                Send for review
              </Button>
            </div>
          ) : null}

          {row.status === "under_review" ? (
            <p className="text-sm text-muted-foreground">
              Waiting for a manager or admin to review your answer.
            </p>
          ) : null}

          {row.status === "completed" && row.answer_text ? (
            <div className="rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap">
              {row.answer_text}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
