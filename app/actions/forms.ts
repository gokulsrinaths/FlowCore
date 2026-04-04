"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";
import type { FormTemplateField } from "@/types";

export type FormActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

function revalidateForms(orgSlug: string, formId?: string) {
  revalidatePath(`/${orgSlug}/forms`);
  if (formId) {
    revalidatePath(`/${orgSlug}/forms/${formId}`);
    revalidatePath(`/${orgSlug}/forms/${formId}/fill`);
  }
}

export async function createFormTemplateAction(
  organizationId: string,
  orgSlug: string,
  title: string,
  description: string,
  fields: FormTemplateField[]
): Promise<FormActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_create_form_template", {
      p_organization_id: organizationId,
      p_title: title.trim(),
      p_description: description.trim(),
      p_fields: fields,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidateForms(orgSlug, r.id);
    return { ok: true, id: r.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}

export async function updateFormTemplateAction(
  organizationId: string,
  orgSlug: string,
  formId: string,
  title: string,
  description: string,
  fields: FormTemplateField[]
): Promise<FormActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_update_form_template", {
      p_organization_id: organizationId,
      p_form_id: formId,
      p_title: title.trim(),
      p_description: description.trim(),
      p_fields: fields,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error ?? "Failed" };
    revalidateForms(orgSlug, formId);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}

export async function deleteFormTemplateAction(
  organizationId: string,
  orgSlug: string,
  formId: string
): Promise<FormActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_delete_form_template", {
      p_organization_id: organizationId,
      p_form_id: formId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error ?? "Failed" };
    revalidateForms(orgSlug);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}

export async function submitFormResponseAction(
  organizationId: string,
  orgSlug: string,
  formId: string,
  answers: Record<string, unknown>,
  caseId: string | null
): Promise<FormActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_submit_form_response", {
      p_organization_id: organizationId,
      p_form_id: formId,
      p_answers: answers,
      p_case_id: caseId && caseId.trim() !== "" ? caseId : null,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error ?? "Failed" };
    revalidateForms(orgSlug, formId);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}
