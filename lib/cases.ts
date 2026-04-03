import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseErrorToError } from "@/lib/supabase-errors";
import type { CaseRow } from "@/types";

export type CaseWithItemCount = CaseRow & { itemCount: number };

export { CASE_STATUS_LABELS } from "@/lib/case-labels";

export const fetchCasesForOrg = cache(
  async (organizationId: string): Promise<CaseWithItemCount[]> => {
    const supabase = await createSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("cases")
      .select("*")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false });

    if (error) throw supabaseErrorToError(error);

    const cases = (rows ?? []) as CaseRow[];
    if (cases.length === 0) return [];

    const { data: itemRows, error: ie } = await supabase
      .from("items")
      .select("case_id")
      .eq("organization_id", organizationId);

    if (ie) throw supabaseErrorToError(ie);

    const countByCase = new Map<string, number>();
    for (const r of itemRows ?? []) {
      const cid = (r as { case_id: string | null }).case_id;
      if (!cid) continue;
      countByCase.set(cid, (countByCase.get(cid) ?? 0) + 1);
    }

    return cases.map((c) => ({
      ...c,
      itemCount: countByCase.get(c.id) ?? 0,
    }));
  }
);

export const fetchCaseById = cache(
  async (
    organizationId: string,
    caseId: string
  ): Promise<CaseRow | null> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("cases")
      .select("*")
      .eq("id", caseId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) throw supabaseErrorToError(error);
    return data ? (data as CaseRow) : null;
  }
);

export async function countCasesForOrg(organizationId: string): Promise<{
  total: number;
  active: number;
}> {
  const supabase = await createSupabaseServerClient();
  const { count: total, error: e1 } = await supabase
    .from("cases")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (e1) throw supabaseErrorToError(e1);

  const { count: closed, error: e2 } = await supabase
    .from("cases")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "closed");

  if (e2) throw supabaseErrorToError(e2);

  const t = total ?? 0;
  const c = closed ?? 0;
  return { total: t, active: t - c };
}

export async function fetchRecentCasesForOrg(
  organizationId: string,
  limit = 5
): Promise<CaseWithItemCount[]> {
  const all = await fetchCasesForOrg(organizationId);
  return all.slice(0, limit);
}
