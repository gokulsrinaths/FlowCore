import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseErrorToError } from "@/lib/supabase-errors";
import type { CaseQuestionRow, MyCaseQuestionRow } from "@/types";

function parseDependsOn(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x));
  }
  return [];
}

function parseLatestAnswer(raw: unknown): CaseQuestionRow["latest_answer"] {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.answer_text !== "string") return null;
  return {
    answer_text: o.answer_text,
    reasoning: o.reasoning != null ? String(o.reasoning) : null,
    answered_by: o.answered_by != null ? String(o.answered_by) : null,
    created_at: String(o.created_at ?? ""),
  };
}

function parseQuestionRow(r: Record<string, unknown>): CaseQuestionRow {
  return {
    id: String(r.id),
    case_id: String(r.case_id),
    question_text: String(r.question_text ?? ""),
    description: r.description != null ? String(r.description) : null,
    assigned_to_participant_id:
      r.assigned_to_participant_id != null
        ? String(r.assigned_to_participant_id)
        : null,
    status: r.status as CaseQuestionRow["status"],
    depends_on: parseDependsOn(r.depends_on),
    order_index: Number(r.order_index ?? 0),
    created_at: String(r.created_at ?? ""),
    deps_unlocked: Boolean(r.deps_unlocked),
    latest_answer: parseLatestAnswer(r.latest_answer),
  };
}

export const fetchCaseQuestions = cache(
  async (organizationId: string, caseId: string): Promise<CaseQuestionRow[]> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_list_case_questions", {
      p_organization_id: organizationId,
      p_case_id: caseId,
    });
    if (error) throw supabaseErrorToError(error);
    if (data == null || typeof data !== "object") return [];
    const o = data as Record<string, unknown>;
    if (o.ok === false) return [];
    const arr = o.questions;
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => parseQuestionRow(x as Record<string, unknown>));
  }
);

export const fetchMyUnlockedCaseQuestions = cache(
  async (organizationId: string): Promise<MyCaseQuestionRow[]> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      "flowcore_list_my_unlocked_case_questions",
      {
        p_organization_id: organizationId,
      }
    );
    if (error) throw supabaseErrorToError(error);
    if (data == null || typeof data !== "object") return [];
    const o = data as Record<string, unknown>;
    if (o.ok === false) return [];
    const arr = o.questions;
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => {
      const r = x as Record<string, unknown>;
      return {
        id: String(r.id),
        case_id: String(r.case_id),
        case_title: String(r.case_title ?? ""),
        org_slug: String(r.org_slug ?? ""),
        question_text: String(r.question_text ?? ""),
        description: r.description != null ? String(r.description) : null,
        status: r.status as MyCaseQuestionRow["status"],
        depends_on: parseDependsOn(r.depends_on),
        order_index: Number(r.order_index ?? 0),
        assigned_to_participant_id:
          r.assigned_to_participant_id != null
            ? String(r.assigned_to_participant_id)
            : null,
        deps_unlocked: Boolean(r.deps_unlocked),
      };
    });
  }
);
