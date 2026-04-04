"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createFormTemplateAction,
  deleteFormTemplateAction,
  updateFormTemplateAction,
} from "@/app/actions/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { newFormFieldId, reindexFields } from "@/lib/form-template-logic";
import type { FormFieldType, FormShowWhenOperator, FormTemplateField } from "@/types";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "short_text", label: "Short answer" },
  { value: "long_text", label: "Paragraph" },
  { value: "mcq_single", label: "Multiple choice (one)" },
  { value: "mcq_multi", label: "Checkboxes (many)" },
];

const OPERATORS: { value: FormShowWhenOperator; label: string }[] = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Does not equal" },
  { value: "contains", label: "Contains" },
  { value: "is_empty", label: "Is empty" },
  { value: "is_not_empty", label: "Is not empty" },
];

function defaultField(type: FormFieldType, orderIndex: number): FormTemplateField {
  return {
    id: newFormFieldId(),
    type,
    label: "",
    placeholder: "",
    required: false,
    options: type === "mcq_single" || type === "mcq_multi" ? ["Option A", "Option B"] : undefined,
    showWhen: null,
    orderIndex,
  };
}

type Props = {
  organizationId: string;
  orgSlug: string;
  mode: "create" | "edit";
  formId?: string;
  initialTitle: string;
  initialDescription: string;
  initialFields: FormTemplateField[];
};

export function FormBuilderEditor({
  organizationId,
  orgSlug,
  mode,
  formId,
  initialTitle,
  initialDescription,
  initialFields,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [fields, setFields] = useState<FormTemplateField[]>(() =>
    reindexFields(initialFields.length ? initialFields : [])
  );
  const [pending, start] = useTransition();

  const base = `/${orgSlug}/forms`;

  const addField = useCallback((type: FormFieldType) => {
    setFields((prev) => {
      const next = [...prev, defaultField(type, prev.length)];
      return reindexFields(next);
    });
  }, []);

  const removeField = useCallback((id: string) => {
    setFields((prev) => reindexFields(prev.filter((f) => f.id !== id)));
  }, []);

  const moveField = useCallback((index: number, delta: number) => {
    setFields((prev) => {
      const j = index + delta;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const t = next[index]!;
      next[index] = next[j]!;
      next[j] = t;
      return reindexFields(next);
    });
  }, []);

  const patchField = useCallback((id: string, patch: Partial<FormTemplateField>) => {
    setFields((prev) =>
      reindexFields(prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
    );
  }, []);

  function save() {
    const t = title.trim();
    if (!t) {
      toast.error("Title is required");
      return;
    }
    const normalized = reindexFields(fields).map((f) => ({
      ...f,
      label: f.label.trim() || "Untitled question",
      options:
        f.type === "mcq_single" || f.type === "mcq_multi"
          ? (() => {
              const cleaned = (f.options ?? [])
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
              return cleaned.length > 0 ? cleaned : ["Option 1"];
            })()
          : undefined,
    }));

    start(async () => {
      if (mode === "create") {
        const res = await createFormTemplateAction(
          organizationId,
          orgSlug,
          t,
          description,
          normalized
        );
        if (res.ok && res.id) {
          toast.success("Form created");
          router.push(`${base}/${res.id}`);
        } else toast.error(res.ok ? "No id returned" : res.error);
      } else if (formId) {
        const res = await updateFormTemplateAction(
          organizationId,
          orgSlug,
          formId,
          t,
          description,
          normalized
        );
        if (res.ok) toast.success("Saved");
        else toast.error(res.error);
      }
    });
  }

  function onDelete() {
    if (!formId || mode !== "edit") return;
    if (!window.confirm("Delete this form and all responses?")) return;
    start(async () => {
      const res = await deleteFormTemplateAction(organizationId, orgSlug, formId);
      if (res.ok) {
        toast.success("Form deleted");
        router.push(base);
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2 max-w-xl flex-1">
          <Label htmlFor="form-title">Form title</Label>
          <Input
            id="form-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Witness intake"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === "edit" && formId ? (
            <Link
              href={`${base}/${formId}/fill`}
              className={cn(buttonVariants({ variant: "outline" }), "touch-manipulation")}
            >
              Open fill view
            </Link>
          ) : null}
          <Button type="button" onClick={save} disabled={pending} className="touch-manipulation">
            {mode === "create" ? "Create form" : "Save changes"}
          </Button>
          {mode === "edit" ? (
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={onDelete}
              className="touch-manipulation"
            >
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 max-w-xl">
        <Label htmlFor="form-desc">Description (optional)</Label>
        <Textarea
          id="form-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Shown above the questions when someone fills the form"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-muted-foreground w-full sm:w-auto sm:mr-2">Add question:</span>
        {FIELD_TYPES.map((ft) => (
          <Button
            key={ft.value}
            type="button"
            variant="outline"
            size="sm"
            className="touch-manipulation"
            onClick={() => addField(ft.value)}
          >
            <Plus className="size-4 mr-1" />
            {ft.label}
          </Button>
        ))}
      </div>

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
          No questions yet. Add a short answer, paragraph, or multiple choice above.
        </p>
      ) : (
        <ul className="space-y-4">
          {fields.map((field, index) => (
            <li key={field.id}>
              <FieldCard
                field={field}
                index={index}
                total={fields.length}
                priorFields={fields.slice(0, index)}
                onMove={moveField}
                onRemove={removeField}
                onPatch={patchField}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function McqOptionsListEditor({
  field,
  onPatch,
}: {
  field: FormTemplateField;
  onPatch: (id: string, p: Partial<FormTemplateField>) => void;
}) {
  const opts = field.options ?? [];
  const isSingle = field.type === "mcq_single";

  function updateOption(index: number, value: string) {
    const next = [...opts];
    next[index] = value;
    onPatch(field.id, { options: next });
  }

  function addOption() {
    const n = opts.length + 1;
    onPatch(field.id, { options: [...opts, `Option ${n}`] });
  }

  function removeOption(index: number) {
    if (opts.length <= 1) return;
    onPatch(field.id, { options: opts.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-4">
      <div>
        <Label className="text-foreground">Answer choices</Label>
        <p className="text-muted-foreground mt-1 text-xs text-pretty">
          {isSingle
            ? "Responders see radio buttons and must pick one."
            : "Responders see checkboxes and can select any number."}{" "}
          Add or remove rows as needed.
        </p>
      </div>
      <ul className="space-y-2" role="list">
        {opts.map((opt, i) => (
          <li key={`${field.id}-choice-${i}`} className="flex items-center gap-2">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/80 bg-background"
              aria-hidden
            >
              {isSingle ? (
                <input
                  type="radio"
                  disabled
                  tabIndex={-1}
                  className="size-4 accent-primary"
                  aria-hidden
                />
              ) : (
                <input
                  type="checkbox"
                  disabled
                  tabIndex={-1}
                  className="size-4 rounded border-input accent-primary"
                  aria-hidden
                />
              )}
            </span>
            <Input
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              className="min-w-0 flex-1 touch-manipulation"
              aria-label={`Choice ${i + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 text-muted-foreground hover:text-destructive touch-manipulation"
              aria-label={`Remove option ${i + 1}`}
              onClick={() => removeOption(i)}
              disabled={opts.length <= 1}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="touch-manipulation"
        onClick={addOption}
      >
        <Plus className="size-4 mr-1" />
        Add option
      </Button>
    </div>
  );
}

function FieldCard({
  field,
  index,
  total,
  priorFields,
  onMove,
  onRemove,
  onPatch,
}: {
  field: FormTemplateField;
  index: number;
  total: number;
  priorFields: FormTemplateField[];
  onMove: (i: number, d: number) => void;
  onRemove: (id: string) => void;
  onPatch: (id: string, p: Partial<FormTemplateField>) => void;
}) {
  const needsValue = useMemo(() => {
    const op = field.showWhen?.operator;
    return op !== "is_empty" && op !== "is_not_empty";
  }, [field.showWhen?.operator]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base font-medium">Question {index + 1}</CardTitle>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 touch-manipulation"
            disabled={index <= 0}
            aria-label="Move up"
            onClick={() => onMove(index, -1)}
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 touch-manipulation"
            disabled={index >= total - 1}
            aria-label="Move down"
            onClick={() => onMove(index, 1)}
          >
            <ChevronDown className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 text-destructive touch-manipulation"
            aria-label="Remove question"
            onClick={() => onRemove(field.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={field.type}
              onValueChange={(v) => {
                const t = v as FormFieldType;
                onPatch(field.id, {
                  type: t,
                  options:
                    t === "mcq_single" || t === "mcq_multi"
                      ? field.options?.length
                        ? field.options
                        : ["Option A", "Option B"]
                      : undefined,
                });
              }}
            >
              <SelectTrigger className="touch-manipulation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((ft) => (
                  <SelectItem key={ft.value} value={ft.value}>
                    {ft.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`req-${field.id}`} className="flex items-center gap-2">
              <input
                id={`req-${field.id}`}
                type="checkbox"
                className="size-4 rounded border-input"
                checked={field.required}
                onChange={(e) => onPatch(field.id, { required: e.target.checked })}
              />
              Required
            </Label>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`label-${field.id}`}>Question text</Label>
          <Input
            id={`label-${field.id}`}
            value={field.label}
            onChange={(e) => onPatch(field.id, { label: e.target.value })}
            placeholder="Your question"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`ph-${field.id}`}>Placeholder (optional)</Label>
          <Input
            id={`ph-${field.id}`}
            value={field.placeholder ?? ""}
            onChange={(e) => onPatch(field.id, { placeholder: e.target.value })}
          />
        </div>
        {(field.type === "mcq_single" || field.type === "mcq_multi") && (
          <McqOptionsListEditor field={field} onPatch={onPatch} />
        )}

        <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
          <Label className="flex items-center gap-2 text-foreground">
            <input
              type="checkbox"
              className="size-4 rounded border-input"
              checked={field.showWhen != null}
              onChange={(e) => {
                if (e.target.checked) {
                  const parent = priorFields[priorFields.length - 1];
                  if (!parent) {
                    toast.error("Add a question above this one first, then set a condition.");
                    return;
                  }
                  onPatch(field.id, {
                    showWhen: {
                      fieldId: parent.id,
                      operator: "equals",
                      value: "",
                    },
                  });
                } else onPatch(field.id, { showWhen: null });
              }}
            />
            Conditional follow-up (show only when…)
          </Label>
          {field.showWhen && priorFields.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Based on answer to</Label>
                <Select
                  value={field.showWhen.fieldId}
                  onValueChange={(fieldId) => {
                    if (!field.showWhen || !fieldId) return;
                    onPatch(field.id, {
                      showWhen: { ...field.showWhen, fieldId },
                    });
                  }}
                >
                  <SelectTrigger className="touch-manipulation">
                    <SelectValue placeholder="Earlier question" />
                  </SelectTrigger>
                  <SelectContent>
                    {priorFields.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label?.trim() || `Question (${p.type})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Condition</Label>
                <Select
                  value={field.showWhen.operator}
                  onValueChange={(op) =>
                    onPatch(field.id, {
                      showWhen: {
                        ...field.showWhen!,
                        operator: op as FormShowWhenOperator,
                      },
                    })
                  }
                >
                  <SelectTrigger className="touch-manipulation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {needsValue ? (
                <div className="space-y-2">
                  <Label>Value</Label>
                  <Input
                    value={field.showWhen.value ?? ""}
                    onChange={(e) =>
                      onPatch(field.id, {
                        showWhen: { ...field.showWhen!, value: e.target.value },
                      })
                    }
                    placeholder="Match text or MCQ option"
                  />
                </div>
              ) : null}
            </div>
          ) : field.showWhen && priorFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Add an earlier question first, then enable conditional logic on a later one.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
