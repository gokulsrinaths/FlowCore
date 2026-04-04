import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseErrorToError } from "@/lib/supabase-errors";
import type { ItemQuestionnaireRow, MyItemQuestionnaireRow } from "@/types";

function parseRow(r: Record<string, unknown>): ItemQuestionnaireRow {
  return {
    id: String(r.id),
    item_id: String(r.item_id),
    question_text: String(r.question_text ?? ""),
    description: r.description != null ? String(r.description) : null,
    assigned_to_user_id: String(r.assigned_to_user_id ?? ""),
    sort_order: Number(r.sort_order ?? 0),
    status: r.status as ItemQuestionnaireRow["status"],
    answer_text: r.answer_text != null ? String(r.answer_text) : null,
    accepted_at: r.accepted_at != null ? String(r.accepted_at) : null,
    submitted_at: r.submitted_at != null ? String(r.submitted_at) : null,
    reviewed_at: r.reviewed_at != null ? String(r.reviewed_at) : null,
    reviewed_by: r.reviewed_by != null ? String(r.reviewed_by) : null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export const fetchItemQuestionnaires = cache(
  async (organizationId: string, itemId: string): Promise<ItemQuestionnaireRow[]> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_list_item_questionnaires", {
      p_organization_id: organizationId,
      p_item_id: itemId,
    });
    if (error) throw supabaseErrorToError(error);
    if (data == null || typeof data !== "object") return [];
    const o = data as Record<string, unknown>;
    if (o.ok === false) return [];
    const arr = o.questions;
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => parseRow(x as Record<string, unknown>));
  }
);

export const fetchMyItemQuestionnaires = cache(
  async (organizationId: string): Promise<MyItemQuestionnaireRow[]> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_list_my_item_questionnaires", {
      p_organization_id: organizationId,
    });
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
        item_id: String(r.item_id),
        item_title: String(r.item_title ?? ""),
        case_id: r.case_id != null ? String(r.case_id) : null,
        question_text: String(r.question_text ?? ""),
        description: r.description != null ? String(r.description) : null,
        status: r.status as MyItemQuestionnaireRow["status"],
        answer_text: r.answer_text != null ? String(r.answer_text) : null,
        accepted_at: r.accepted_at != null ? String(r.accepted_at) : null,
        submitted_at: r.submitted_at != null ? String(r.submitted_at) : null,
        updated_at: String(r.updated_at ?? ""),
      };
    });
  }
);

export async function countMyActionableQuestionnaires(
  organizationId: string
): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "flowcore_count_my_actionable_item_questionnaires",
    {
      p_organization_id: organizationId,
    }
  );
  if (error || data == null || typeof data !== "object") return 0;
  const o = data as Record<string, unknown>;
  if (o.ok === false) return 0;
  return typeof o.count === "number" ? o.count : Number(o.count ?? 0);
}
