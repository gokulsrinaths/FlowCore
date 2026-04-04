"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { submitFormResponseAction } from "@/app/actions/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  isFormFieldVisible,
  sortedFormFields,
  validateFormAnswers,
} from "@/lib/form-template-logic";
import type { FormTemplateDetail } from "@/types";

type Props = {
  organizationId: string;
  orgSlug: string;
  form: FormTemplateDetail;
  /** Optional case to attach submission to */
  caseId: string | null;
};

export function FormFillView({ organizationId, orgSlug, form, caseId }: Props) {
  const router = useRouter();
  const ordered = useMemo(() => sortedFormFields(form.fields), [form.fields]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [pending, start] = useTransition();

  function setAnswer(id: string, v: unknown) {
    setAnswers((prev) => ({ ...prev, [id]: v }));
  }

  function toggleMulti(id: string, option: string, checked: boolean) {
    setAnswers((prev) => {
      const cur = prev[id];
      const arr = Array.isArray(cur) ? [...cur] : [];
      if (checked) {
        if (!arr.includes(option)) arr.push(option);
      } else {
        const i = arr.indexOf(option);
        if (i >= 0) arr.splice(i, 1);
      }
      return { ...prev, [id]: arr };
    });
  }

  function submit() {
    const v = validateFormAnswers(form.fields, answers);
    if (!v.ok) {
      toast.error(v.message);
      return;
    }
    start(async () => {
      const res = await submitFormResponseAction(
        organizationId,
        orgSlug,
        form.id,
        answers,
        caseId
      );
      if (res.ok) {
        toast.success("Response submitted");
        router.push(`/${orgSlug}/forms/${form.id}`);
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{form.title}</h2>
        {form.description ? (
          <p className="text-muted-foreground text-sm mt-2 text-pretty">{form.description}</p>
        ) : null}
      </div>

      <div className="space-y-6">
        {ordered.map((field) => {
          if (!isFormFieldVisible(field, answers)) return null;
          return (
            <Card key={field.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {field.label || "Question"}
                  {field.required ? <span className="text-destructive"> *</span> : null}
                </CardTitle>
                {field.placeholder ? (
                  <CardDescription className="text-xs">{field.placeholder}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-2">
                {field.type === "short_text" && (
                  <Input
                    value={String(answers[field.id] ?? "")}
                    onChange={(e) => setAnswer(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    className="touch-manipulation"
                  />
                )}
                {field.type === "long_text" && (
                  <Textarea
                    value={String(answers[field.id] ?? "")}
                    onChange={(e) => setAnswer(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    rows={4}
                    className="touch-manipulation"
                  />
                )}
                {field.type === "mcq_single" && (
                  <div className="space-y-2">
                    {(field.options ?? []).map((opt) => (
                      <label
                        key={opt}
                        className="flex cursor-pointer items-center gap-2 text-sm touch-manipulation"
                      >
                        <input
                          type="radio"
                          name={field.id}
                          className="size-4"
                          checked={answers[field.id] === opt}
                          onChange={() => setAnswer(field.id, opt)}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}
                {field.type === "mcq_multi" && (
                  <div className="space-y-2">
                    {(field.options ?? []).map((opt) => {
                      const selected = Array.isArray(answers[field.id])
                        ? (answers[field.id] as string[]).includes(opt)
                        : false;
                      return (
                        <label
                          key={opt}
                          className="flex cursor-pointer items-center gap-2 text-sm touch-manipulation"
                        >
                          <input
                            type="checkbox"
                            className="size-4 rounded border-input"
                            checked={selected}
                            onChange={(e) => toggleMulti(field.id, opt, e.target.checked)}
                          />
                          {opt}
                        </label>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={submit} disabled={pending} className="touch-manipulation">
          Submit
        </Button>
        <Button
          type="button"
          variant="outline"
          className="touch-manipulation"
          onClick={() => router.push(`/${orgSlug}/forms/${form.id}`)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
