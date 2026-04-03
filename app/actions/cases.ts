"use server";

import { revalidatePath } from "next/cache";
import { detailsToAccusedJson } from "@/lib/case-accused";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";
import type { CaseStatus } from "@/types";

function accusedFromForm(formData: FormData): unknown | null {
  const a1 = String(formData.get("accused_a1") ?? "");
  const a2 = String(formData.get("accused_a2") ?? "");
  const a3 = String(formData.get("accused_a3") ?? "");
  return detailsToAccusedJson({ a1, a2, a3 });
}

export type CaseActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

function catchErr(e: unknown): CaseActionResult {
  return {
    ok: false,
    error: e instanceof Error ? e.message : "Something went wrong",
  };
}

function revalidateCasePaths(orgSlug: string) {
  revalidatePath(`/${orgSlug}/cases`);
  revalidatePath(`/${orgSlug}/dashboard`);
  revalidatePath(`/${orgSlug}/items`);
  revalidatePath(`/${orgSlug}/activity`);
}

export async function createCaseAction(formData: FormData): Promise<CaseActionResult> {
  try {
    const orgId = String(formData.get("organization_id") ?? "").trim();
    const orgSlug = String(formData.get("org_slug") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const crimeNumber = String(formData.get("crime_number") ?? "").trim();
    const district = String(formData.get("district") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const financialRaw = String(formData.get("financial_impact") ?? "").trim();
    const status = String(formData.get("status") ?? "open").trim() as CaseStatus;

    const accused = accusedFromForm(formData);

    const financial_impact =
      financialRaw === "" ? null : Number.parseFloat(financialRaw);
    if (financialRaw !== "" && Number.isNaN(financial_impact as number)) {
      return { ok: false, error: "Defrauded amount must be a number" };
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_create_case", {
      p_organization_id: orgId,
      p_title: title,
      p_crime_number: crimeNumber,
      p_district: district,
      p_description: description,
      p_accused: accused,
      p_financial_impact: financial_impact,
      p_status: status,
    });

    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    if (orgSlug) {
      revalidateCasePaths(orgSlug);
      if (r.id) revalidatePath(`/${orgSlug}/cases/${r.id}`);
    }
    return { ok: true, id: r.id };
  } catch (e) {
    return catchErr(e);
  }
}

export async function updateCaseAction(formData: FormData): Promise<CaseActionResult> {
  try {
    const orgId = String(formData.get("organization_id") ?? "").trim();
    const orgSlug = String(formData.get("org_slug") ?? "").trim();
    const caseId = String(formData.get("case_id") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const crimeNumber = String(formData.get("crime_number") ?? "").trim();
    const district = String(formData.get("district") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const financialRaw = String(formData.get("financial_impact") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim() as CaseStatus;

    const accused = accusedFromForm(formData);

    const financial_impact =
      financialRaw === "" ? null : Number.parseFloat(financialRaw);
    if (financialRaw !== "" && Number.isNaN(financial_impact as number)) {
      return { ok: false, error: "Defrauded amount must be a number" };
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_update_case", {
      p_organization_id: orgId,
      p_case_id: caseId,
      p_title: title,
      p_crime_number: crimeNumber,
      p_district: district,
      p_description: description,
      p_accused: accused,
      p_financial_impact: financial_impact,
      p_status: status,
    });

    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    if (orgSlug) {
      revalidateCasePaths(orgSlug);
      revalidatePath(`/${orgSlug}/cases/${caseId}`);
    }
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

export async function deleteCaseAction(
  organizationId: string,
  orgSlug: string,
  caseId: string
): Promise<CaseActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_delete_case", {
      p_organization_id: organizationId,
      p_case_id: caseId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidateCasePaths(orgSlug);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

export async function assignItemToCaseAction(
  organizationId: string,
  orgSlug: string,
  itemId: string,
  caseId: string | null
): Promise<CaseActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_assign_item_to_case", {
      p_organization_id: organizationId,
      p_item_id: itemId,
      p_case_id: caseId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath(`/${orgSlug}/items`);
    revalidatePath(`/${orgSlug}/items/${itemId}`);
    revalidatePath(`/${orgSlug}/cases`);
    if (caseId) revalidatePath(`/${orgSlug}/cases/${caseId}`);
    revalidatePath(`/${orgSlug}/dashboard`);
    revalidatePath(`/${orgSlug}/activity`);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}
