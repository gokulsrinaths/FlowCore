"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";

export type ItemQuestionnaireActionResult = { ok: true } | { ok: false; error: string };

function revalidateItemQuestionnairePaths(
  orgSlug: string,
  itemId: string,
  caseId?: string | null
) {
  revalidatePath(`/${orgSlug}/items`);
  revalidatePath(`/${orgSlug}/items/${itemId}`);
  revalidatePath(`/${orgSlug}/questionnaires`);
  revalidatePath(`/${orgSlug}/dashboard`);
  if (caseId) revalidatePath(`/${orgSlug}/cases/${caseId}`);
}

export async function getActionableQuestionnaireCountForNav(
  organizationId: string
): Promise<number> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      "flowcore_count_my_actionable_item_questionnaires",
      { p_organization_id: organizationId }
    );
    if (error || data == null || typeof data !== "object") return 0;
    const o = data as Record<string, unknown>;
    if (o.ok === false) return 0;
    return typeof o.count === "number" ? o.count : Number(o.count ?? 0);
  } catch {
    return 0;
  }
}

export async function createItemQuestionnaireAction(
  organizationId: string,
  orgSlug: string,
  itemId: string,
  questionText: string,
  description: string,
  assignedToUserId: string,
  caseId: string | null
): Promise<ItemQuestionnaireActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_create_item_questionnaire", {
      p_organization_id: organizationId,
      p_item_id: itemId,
      p_question_text: questionText,
      p_description: description,
      p_assigned_to_user_id: assignedToUserId,
      p_sort_order: null,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidateItemQuestionnairePaths(orgSlug, itemId, caseId);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}

export async function deleteItemQuestionnaireAction(
  organizationId: string,
  orgSlug: string,
  questionnaireId: string,
  itemId: string,
  caseId: string | null
): Promise<ItemQuestionnaireActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_delete_item_questionnaire", {
      p_organization_id: organizationId,
      p_questionnaire_id: questionnaireId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidateItemQuestionnairePaths(orgSlug, itemId, caseId);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}

export async function acceptItemQuestionnaireAction(
  organizationId: string,
  orgSlug: string,
  questionnaireId: string,
  itemId: string,
  caseId: string | null
): Promise<ItemQuestionnaireActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_accept_item_questionnaire", {
      p_organization_id: organizationId,
      p_questionnaire_id: questionnaireId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidateItemQuestionnairePaths(orgSlug, itemId, caseId);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}

export async function submitItemQuestionnaireAnswerAction(
  organizationId: string,
  orgSlug: string,
  questionnaireId: string,
  itemId: string,
  answerText: string,
  caseId: string | null
): Promise<ItemQuestionnaireActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      "flowcore_submit_item_questionnaire_answer",
      {
        p_organization_id: organizationId,
        p_questionnaire_id: questionnaireId,
        p_answer_text: answerText,
      }
    );
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidateItemQuestionnairePaths(orgSlug, itemId, caseId);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}

export async function reviewItemQuestionnaireAction(
  organizationId: string,
  orgSlug: string,
  questionnaireId: string,
  itemId: string,
  approve: boolean,
  caseId: string | null
): Promise<ItemQuestionnaireActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_review_item_questionnaire", {
      p_organization_id: organizationId,
      p_questionnaire_id: questionnaireId,
      p_approve: approve,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidateItemQuestionnairePaths(orgSlug, itemId, caseId);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}
