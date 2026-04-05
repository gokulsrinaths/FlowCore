"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  assignCaseQuestionAction,
  createCaseQuestionAction,
  deleteCaseQuestionAction,
  reorderCaseQuestionsAction,
  submitCaseQuestionAnswerAction,
  updateCaseQuestionAction,
} from "@/app/actions/case-questions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CaseParticipant, CaseQuestionRow, CaseQuestionStatus } from "@/types";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

const CASE_Q_STATUS_LABELS: Record<CaseQuestionStatus, string> = {
  pending: "Not started",
  in_progress: "In progress",
  answered: "Answered",
};

function participantLabel(p: CaseParticipant): string {
  if (p.user_name?.trim()) return p.user_name;
  if (p.user_email?.trim()) return p.user_email;
  if (p.email?.trim()) return p.email;
  return p.id.slice(0, 8);
}

type Props = {
  organizationId: string;
  orgSlug: string;
  caseId: string;
  participants: CaseParticipant[];
  questions: CaseQuestionRow[];
  currentUserId: string;
};

export function CaseQuestionsPanel({
  organizationId,
  orgSlug,
  caseId,
  participants,
  questions: initialQuestions,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [questions, setQuestions] = useState(initialQuestions);
  const [openCreate, setOpenCreate] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [editId, setEditId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const sorted = useMemo(
    () => [...questions].sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at)),
    [questions]
  );

  function refresh() {
    router.refresh();
  }

  useEffect(() => {
    setQuestions(initialQuestions);
  }, [initialQuestions]);

  function moveQuestion(index: number, dir: -1 | 1) {
    const next = [...sorted];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    const ids = next.map((q) => q.id);
    start(async () => {
      const res = await reorderCaseQuestionsAction(organizationId, orgSlug, caseId, ids);
      if (res.ok) {
        toast.success("Order updated");
        refresh();
      } else toast.error(res.error);
    });
  }

  function onDelete(id: string) {
    if (!window.confirm("Delete this question?")) return;
    start(async () => {
      const res = await deleteCaseQuestionAction(organizationId, orgSlug, caseId, id);
      if (res.ok) {
        toast.success("Question removed from case");
        refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Case questions</h3>
          <p className="text-muted-foreground text-sm">
            Assign to participants, chain dependencies, answer when unlocked.
          </p>
        </div>
        <Button
          type="button"
          className="w-full gap-2 sm:w-auto"
          onClick={() => {
            setCreateKey((k) => k + 1);
            setOpenCreate(true);
          }}
        >
          <Plus className="size-4" />
          Add question
        </Button>
      </div>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create question</DialogTitle>
            <DialogDescription>
              Optional assignee and dependencies on other questions in this case.
            </DialogDescription>
          </DialogHeader>
          <QuestionForm
            key={createKey}
            mode="create"
            organizationId={organizationId}
            orgSlug={orgSlug}
            caseId={caseId}
            participants={participants}
            otherQuestions={sorted}
            excludeQuestionId={null}
            onDone={() => {
              setOpenCreate(false);
              refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      {editId ? (
        <Dialog open onOpenChange={(o) => !o && setEditId(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit case question</DialogTitle>
            </DialogHeader>
            {(() => {
              const q = sorted.find((x) => x.id === editId);
              if (!q) return null;
              return (
                <QuestionForm
                  key={q.id}
                  mode="edit"
                  organizationId={organizationId}
                  orgSlug={orgSlug}
                  caseId={caseId}
                  participants={participants}
                  otherQuestions={sorted}
                  excludeQuestionId={q.id}
                  initial={q}
                  onDone={() => {
                    setEditId(null);
                    refresh();
                  }}
                />
              );
            })()}
          </DialogContent>
        </Dialog>
      ) : null}

      {sorted.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">No questions yet</CardTitle>
            <CardDescription>
              Add questions when you need specific answers from people on this case.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {sorted.map((q, idx) => (
            <li key={q.id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">#{idx + 1}</Badge>
                        <Badge
                          variant={
                            q.status === "answered"
                              ? "default"
                              : q.deps_unlocked
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {CASE_Q_STATUS_LABELS[q.status]}
                          {!q.deps_unlocked && q.status !== "answered" ? " · waiting on earlier answers" : ""}
                        </Badge>
                      </div>
                      <CardTitle className="text-base leading-snug">{q.question_text}</CardTitle>
                      {q.description ? (
                        <CardDescription className="text-pretty">{q.description}</CardDescription>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label="Move up"
                        disabled={pending || idx === 0}
                        onClick={() => moveQuestion(idx, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label="Move down"
                        disabled={pending || idx === sorted.length - 1}
                        onClick={() => moveQuestion(idx, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      Assignee:{" "}
                      {q.assigned_to_participant_id
                        ? participantLabel(
                            participants.find((p) => p.id === q.assigned_to_participant_id) ??
                              ({
                                id: q.assigned_to_participant_id,
                              } as CaseParticipant)
                          )
                        : "—"}
                    </span>
                    {q.depends_on.length > 0 ? (
                      <span>Depends on {q.depends_on.length} question(s)</span>
                    ) : null}
                  </div>

                  {q.status === "answered" && q.latest_answer ? (
                    <div className="bg-muted/40 rounded-lg border border-border/60 p-3 text-sm">
                      <p className="text-muted-foreground text-xs uppercase tracking-wide">Answer</p>
                      <p className="mt-1 whitespace-pre-wrap">{q.latest_answer.answer_text}</p>
                      {q.latest_answer.reasoning ? (
                        <p className="text-muted-foreground mt-2 text-xs whitespace-pre-wrap">
                          Reasoning: {q.latest_answer.reasoning}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <AssignRow
                      organizationId={organizationId}
                      orgSlug={orgSlug}
                      caseId={caseId}
                      questionId={q.id}
                      participants={participants}
                      disabled={pending || q.status === "answered"}
                      onDone={refresh}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={q.status === "answered"}
                      onClick={() => setEditId(q.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={pending || q.status === "answered"}
                      onClick={() => onDelete(q.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <AnswerBlock
                    q={q}
                    organizationId={organizationId}
                    orgSlug={orgSlug}
                    caseId={caseId}
                    participants={participants}
                    currentUserId={currentUserId}
                    onDone={refresh}
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssignRow({
  organizationId,
  orgSlug,
  caseId,
  questionId,
  participants,
  disabled,
  onDone,
}: {
  organizationId: string;
  orgSlug: string;
  caseId: string;
  questionId: string;
  participants: CaseParticipant[];
  disabled: boolean;
  onDone: () => void;
}) {
  const [pid, setPid] = useState<string>("");
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1 space-y-1">
        <Label className="text-xs">Assign to</Label>
        <Select value={pid || undefined} onValueChange={(v) => setPid(v ?? "")}>
          <SelectTrigger className="w-full md:max-w-xs">
            <SelectValue placeholder="Choose someone…" />
          </SelectTrigger>
          <SelectContent>
            {participants.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {participantLabel(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        size="sm"
        disabled={disabled || !pid || pending}
        onClick={() => {
          start(async () => {
            const res = await assignCaseQuestionAction(
              organizationId,
              orgSlug,
              caseId,
              questionId,
              pid
            );
            if (res.ok) {
              toast.success("Assignment saved");
              setPid("");
              onDone();
            } else toast.error(res.error);
          });
        }}
      >
        Assign
      </Button>
    </div>
  );
}

function AnswerBlock({
  q,
  organizationId,
  orgSlug,
  caseId,
  participants,
  currentUserId,
  onDone,
}: {
  q: CaseQuestionRow;
  organizationId: string;
  orgSlug: string;
  caseId: string;
  participants: CaseParticipant[];
  currentUserId: string;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const assignee = q.assigned_to_participant_id
    ? participants.find((p) => p.id === q.assigned_to_participant_id)
    : null;
  const canAnswer =
    assignee?.user_id === currentUserId &&
    q.deps_unlocked &&
    q.status !== "answered";

  if (!canAnswer) return null;

  return (
    <form
      className="border-border/80 space-y-2 border-t pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await submitCaseQuestionAnswerAction(
            organizationId,
            orgSlug,
            caseId,
            q.id,
            fd
          );
          if (res.ok) {
            toast.success("Answer sent");
            onDone();
          } else toast.error(res.error);
        });
      }}
    >
      <p className="font-medium text-sm">Your answer</p>
      <div className="space-y-2">
        <Label htmlFor={`ans-${q.id}`}>Your answer</Label>
        <Textarea id={`ans-${q.id}`} name="answer_text" required rows={3} placeholder="Type your answer" />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`reas-${q.id}`}>Context (optional)</Label>
        <Textarea id={`reas-${q.id}`} name="reasoning" rows={2} placeholder="Any extra context for your team" />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        Submit answer
      </Button>
    </form>
  );
}

function QuestionForm({
  mode,
  organizationId,
  orgSlug,
  caseId,
  participants,
  otherQuestions,
  excludeQuestionId,
  initial,
  onDone,
}: {
  mode: "create" | "edit";
  organizationId: string;
  orgSlug: string;
  caseId: string;
  participants: CaseParticipant[];
  otherQuestions: CaseQuestionRow[];
  excludeQuestionId: string | null;
  initial?: CaseQuestionRow;
  onDone: () => void;
}) {
  const [deps, setDeps] = useState<Set<string>>(
    () => new Set(initial?.depends_on ?? [])
  );
  const [assign, setAssign] = useState(initial?.assigned_to_participant_id ?? "");
  const [pending, start] = useTransition();

  const depChoices = otherQuestions.filter((q) => q.id !== excludeQuestionId);

  function toggleDep(id: string) {
    setDeps((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("depends_on", JSON.stringify([...deps]));
        if (mode === "create") {
          fd.set("assigned_to_participant_id", assign.trim());
        }
        start(async () => {
          if (mode === "create") {
            const res = await createCaseQuestionAction(organizationId, orgSlug, caseId, fd);
            if (res.ok) {
              toast.success("Question added");
              onDone();
            } else toast.error(res.error);
          } else if (initial) {
            fd.set("order_index", String(initial.order_index));
            const res = await updateCaseQuestionAction(
              organizationId,
              orgSlug,
              caseId,
              initial.id,
              fd
            );
            if (res.ok) {
              toast.success("Question saved");
              onDone();
            } else toast.error(res.error);
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="cq-text">Question text</Label>
        <Textarea
          id="cq-text"
          name="question_text"
          required
          rows={2}
          defaultValue={initial?.question_text}
          placeholder="What do you need to know?"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cq-desc">More detail (optional)</Label>
        <Textarea
          id="cq-desc"
          name="description"
          rows={2}
          defaultValue={initial?.description ?? ""}
        />
      </div>
      {mode === "create" ? (
        <div className="space-y-2">
          <Label>Assign now (optional)</Label>
          <Select value={assign || undefined} onValueChange={(v) => setAssign(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              {participants.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {participantLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {depChoices.length > 0 ? (
        <div className="space-y-2">
          <Label>Unlock only after these are answered</Label>
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border/80 p-2">
            {depChoices.map((q) => (
              <label
                key={q.id}
                className="flex cursor-pointer items-start gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={deps.has(q.id)}
                  onChange={() => toggleDep(q.id)}
                />
                <span className="min-w-0">
                  <span className="line-clamp-2 font-medium">{q.question_text}</span>
                  <span className="text-muted-foreground text-xs">
                    {" "}
                    ({CASE_Q_STATUS_LABELS[q.status]})
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="submit" disabled={pending}>
          {mode === "create" ? "Add question" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
