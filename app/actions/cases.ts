"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";
import type { CaseStatus } from "@/types";

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
    const description = String(formData.get("description") ?? "").trim();
    const accusedRaw = String(formData.get("accused") ?? "").trim();
    const financialRaw = String(formData.get("financial_impact") ?? "").trim();
    const status = String(formData.get("status") ?? "open").trim() as CaseStatus;

    let accused: unknown = null;
    if (accusedRaw) {
      try {
        accused = JSON.parse(accusedRaw);
      } catch {
        accused = { raw: accusedRaw };
      }
    }

    const financial_impact =
      financialRaw === "" ? null : Number.parseFloat(financialRaw);
    if (financialRaw !== "" && Number.isNaN(financial_impact as number)) {
      return { ok: false, error: "Financial impact must be a number" };
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_create_case", {
      p_organization_id: orgId,
      p_title: title,
      p_crime_number: crimeNumber,
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
    const description = String(formData.get("description") ?? "").trim();
    const accusedRaw = String(formData.get("accused") ?? "").trim();
    const financialRaw = String(formData.get("financial_impact") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim() as CaseStatus;

    let accused: unknown = null;
    if (accusedRaw) {
      try {
        accused = JSON.parse(accusedRaw);
      } catch {
        accused = { raw: accusedRaw };
      }
    }

    const financial_impact =
      financialRaw === "" ? null : Number.parseFloat(financialRaw);
    if (financialRaw !== "" && Number.isNaN(financial_impact as number)) {
      return { ok: false, error: "Financial impact must be a number" };
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_update_case", {
      p_organization_id: orgId,
      p_case_id: caseId,
      p_title: title,
      p_crime_number: crimeNumber,
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
