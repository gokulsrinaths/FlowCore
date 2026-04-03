"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";

export type CaseQuestionActionResult =
  | { ok: true }
  | { ok: false; error: string };

function catchErr(e: unknown): CaseQuestionActionResult {
  return {
    ok: false,
    error: e instanceof Error ? e.message : "Something went wrong",
  };
}

function revalidateCaseQuestionPaths(orgSlug: string, caseId: string) {
  revalidatePath(`/${orgSlug}/cases/${caseId}`);
  revalidatePath(`/${orgSlug}/dashboard`);
}

export async function createCaseQuestionAction(
  organizationId: string,
  orgSlug: string,
  caseId: string,
  formData: FormData
): Promise<CaseQuestionActionResult> {
  try {
    const question_text = String(formData.get("question_text") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const depsRaw = String(formData.get("depends_on") ?? "[]").trim();
    const assignRaw = String(formData.get("assigned_to_participant_id") ?? "").trim();

    let depends_on: unknown = [];
    try {
      depends_on = JSON.parse(depsRaw || "[]");
    } catch {
      return { ok: false, error: "Invalid dependencies JSON" };
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_create_case_question", {
      p_organization_id: organizationId,
      p_case_id: caseId,
      p_question_text: question_text,
      p_description: description || null,
      p_depends_on: depends_on,
      p_order_index: null,
      p_assigned_to_participant_id: assignRaw ? assignRaw : null,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidateCaseQuestionPaths(orgSlug, caseId);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

export async function updateCaseQuestionAction(
  organizationId: string,
  orgSlug: string,
  caseId: string,
  questionId: string,
  formData: FormData
): Promise<CaseQuestionActionResult> {
  try {
    const question_text = String(formData.get("question_text") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const depsRaw = String(formData.get("depends_on") ?? "[]").trim();
    const order_index = Number(formData.get("order_index") ?? 0);

    let depends_on: unknown = [];
    try {
      depends_on = JSON.parse(depsRaw || "[]");
    } catch {
      return { ok: false, error: "Invalid dependencies JSON" };
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_update_case_question", {
      p_organization_id: organizationId,
      p_case_id: caseId,
      p_question_id: questionId,
      p_question_text: question_text,
      p_description: description,
      p_depends_on: depends_on,
      p_order_index: order_index,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidateCaseQuestionPaths(orgSlug, caseId);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

export async function assignCaseQuestionAction(
  organizationId: string,
  orgSlug: string,
  caseId: string,
  questionId: string,
  participantId: string | null
): Promise<CaseQuestionActionResult> {
  try {
    if (!participantId) {
      return { ok: false, error: "Select a participant" };
    }
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_assign_question", {
      p_organization_id: organizationId,
      p_case_id: caseId,
      p_question_id: questionId,
      p_participant_id: participantId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidateCaseQuestionPaths(orgSlug, caseId);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

export async function reorderCaseQuestionsAction(
  organizationId: string,
  orgSlug: string,
  caseId: string,
  orderedQuestionIds: string[]
): Promise<CaseQuestionActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_reorder_case_questions", {
      p_organization_id: organizationId,
      p_case_id: caseId,
      p_ordered_question_ids: orderedQuestionIds,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidateCaseQuestionPaths(orgSlug, caseId);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

export async function deleteCaseQuestionAction(
  organizationId: string,
  orgSlug: string,
  caseId: string,
  questionId: string
): Promise<CaseQuestionActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_delete_case_question", {
      p_organization_id: organizationId,
      p_case_id: caseId,
      p_question_id: questionId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidateCaseQuestionPaths(orgSlug, caseId);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

export async function submitCaseQuestionAnswerAction(
  organizationId: string,
  orgSlug: string,
  caseId: string,
  questionId: string,
  formData: FormData
): Promise<CaseQuestionActionResult> {
  try {
    const answer_text = String(formData.get("answer_text") ?? "").trim();
    const reasoning = String(formData.get("reasoning") ?? "").trim();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_submit_answer", {
      p_organization_id: organizationId,
      p_case_id: caseId,
      p_question_id: questionId,
      p_answer_text: answer_text,
      p_reasoning: reasoning || null,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidateCaseQuestionPaths(orgSlug, caseId);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}
