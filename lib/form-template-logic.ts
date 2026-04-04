import type {
  FormFieldShowWhen,
  FormShowWhenOperator,
  FormTemplateField,
} from "@/types";

function str(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function isEmptyValue(v: unknown): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  return String(v).trim() === "";
}

export function evaluateShowWhen(
  cond: FormFieldShowWhen,
  answers: Record<string, unknown>
): boolean {
  const raw = answers[cond.fieldId];
  const empty = isEmptyValue(raw);
  const op: FormShowWhenOperator = cond.operator;
  const value = cond.value ?? "";

  switch (op) {
    case "is_empty":
      return empty;
    case "is_not_empty":
      return !empty;
    case "equals":
      if (Array.isArray(raw)) return raw.includes(value);
      return str(raw) === value;
    case "not_equals":
      if (Array.isArray(raw)) return !raw.includes(value);
      return str(raw) !== value;
    case "contains":
      return str(raw).includes(value);
    default:
      return true;
  }
}

export function isFormFieldVisible(
  field: FormTemplateField,
  answers: Record<string, unknown>
): boolean {
  if (field.showWhen == null) return true;
  return evaluateShowWhen(field.showWhen, answers);
}

export function sortedFormFields(fields: FormTemplateField[]): FormTemplateField[] {
  return [...fields].sort((a, b) => a.orderIndex - b.orderIndex);
}

export function validateFormAnswers(
  fields: FormTemplateField[],
  answers: Record<string, unknown>
): { ok: true } | { ok: false; message: string } {
  const ordered = sortedFormFields(fields);
  for (const f of ordered) {
    if (!isFormFieldVisible(f, answers)) continue;
    if (!f.required) continue;
    const v = answers[f.id];
    if (isEmptyValue(v)) {
      return { ok: false, message: `Please answer: ${f.label || "required field"}` };
    }
  }
  return { ok: true };
}

export function normalizeFieldsFromJson(raw: unknown): FormTemplateField[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x, i) => {
    const o = x as Record<string, unknown>;
    const type = o.type;
    const validTypes = ["short_text", "long_text", "mcq_single", "mcq_multi"] as const;
    const t = validTypes.includes(type as (typeof validTypes)[number])
      ? (type as FormTemplateField["type"])
      : "short_text";
    let options: string[] | undefined;
    if (Array.isArray(o.options)) {
      options = o.options.map((z) => String(z));
    }
    let showWhen: FormTemplateField["showWhen"] = null;
    if (o.showWhen != null && typeof o.showWhen === "object") {
      const sw = o.showWhen as Record<string, unknown>;
      const op = sw.operator;
      const ops = ["equals", "not_equals", "contains", "is_empty", "is_not_empty"] as const;
      if (
        typeof sw.fieldId === "string" &&
        ops.includes(op as (typeof ops)[number])
      ) {
        showWhen = {
          fieldId: sw.fieldId,
          operator: op as FormFieldShowWhen["operator"],
          value: sw.value != null ? String(sw.value) : undefined,
        };
      }
    }
    return {
      id: String(o.id ?? `field_${i}`),
      type: t,
      label: String(o.label ?? ""),
      placeholder: o.placeholder != null ? String(o.placeholder) : undefined,
      required: Boolean(o.required),
      options: options ?? (t === "mcq_single" || t === "mcq_multi" ? [] : undefined),
      showWhen,
      orderIndex: typeof o.orderIndex === "number" ? o.orderIndex : i,
    };
  });
}

export function reindexFields(fields: FormTemplateField[]): FormTemplateField[] {
  return fields.map((f, i) => ({ ...f, orderIndex: i }));
}

export function newFormFieldId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
