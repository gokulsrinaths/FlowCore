import { supabaseErrorToError } from "@/lib/supabase-errors";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { PlanTier } from "@/types";

/** Plan limits — align with lib/billing.ts and future Stripe metadata */
export const PLAN_LIMITS: Record<
  PlanTier,
  { maxMembers: number; maxItems: number; maxPendingInvites: number }
> = {
  free: { maxMembers: 10, maxItems: 200, maxPendingInvites: 5 },
  pro: { maxMembers: 100, maxItems: 10000, maxPendingInvites: 50 },
  enterprise: {
    maxMembers: 1_000_000,
    maxItems: 1_000_000,
    maxPendingInvites: 1_000,
  },
};

export type UsageCheck =
  | { ok: true }
  | { ok: false; error: string; code: "limit_members" | "limit_items" | "limit_invites" };

export async function getOrgPlan(
  organizationId: string
): Promise<PlanTier> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw supabaseErrorToError(error);
  const p = data?.plan as PlanTier | undefined;
  if (p === "pro" || p === "enterprise" || p === "free") return p;
  return "free";
}

async function countOrgMembers(organizationId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("organization_members")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (error) throw supabaseErrorToError(error);
  return count ?? 0;
}

async function countOrgItems(organizationId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (error) throw supabaseErrorToError(error);
  return count ?? 0;
}

async function countPendingInvites(organizationId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("accepted_at", null);

  if (error) throw supabaseErrorToError(error);
  return count ?? 0;
}

export async function canAddMember(
  organizationId: string
): Promise<UsageCheck> {
  const plan = await getOrgPlan(organizationId);
  const lim = PLAN_LIMITS[plan];
  const n = await countOrgMembers(organizationId);
  if (n >= lim.maxMembers) {
    return {
      ok: false,
      error: `Member limit reached (${lim.maxMembers}) on ${plan} plan.`,
      code: "limit_members",
    };
  }
  return { ok: true };
}

export async function canCreateItem(
  organizationId: string
): Promise<UsageCheck> {
  const plan = await getOrgPlan(organizationId);
  const lim = PLAN_LIMITS[plan];
  const n = await countOrgItems(organizationId);
  if (n >= lim.maxItems) {
    return {
      ok: false,
      error: `Item limit reached (${lim.maxItems}) on ${plan} plan.`,
      code: "limit_items",
    };
  }
  return { ok: true };
}

export async function canCreateInvite(
  organizationId: string
): Promise<UsageCheck> {
  const plan = await getOrgPlan(organizationId);
  const lim = PLAN_LIMITS[plan];
  const n = await countPendingInvites(organizationId);
  if (n >= lim.maxPendingInvites) {
    return {
      ok: false,
      error: `Pending invite limit reached (${lim.maxPendingInvites}).`,
      code: "limit_invites",
    };
  }
  return { ok: true };
}
