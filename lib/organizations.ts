import { supabaseErrorToError } from "@/lib/supabase-errors";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { OrganizationWithRole, OrgMemberRow, OrgRole } from "@/types";
import { cache } from "react";

/**
 * List workspaces the current user belongs to (via RPC).
 */
export const getOrganizationsForUser = cache(async (): Promise<
  OrganizationWithRole[]
> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("flowcore_list_user_organizations");
  if (error) throw supabaseErrorToError(error);
  if (data == null) return [];
  if (Array.isArray(data)) return data as OrganizationWithRole[];
  if (typeof data === "string") {
    try {
      const p = JSON.parse(data);
      return Array.isArray(p) ? (p as OrganizationWithRole[]) : [];
    } catch {
      return [];
    }
  }
  return [];
});

/**
 * Resolve org by slug and ensure the current user is a member.
 */
export const getOrgMembershipBySlug = cache(
  async (
    slug: string
  ): Promise<{ organization: OrganizationWithRole } | null> => {
    const orgs = await getOrganizationsForUser();
    const hit = orgs.find((o) => o.slug === slug);
    if (!hit) return null;
    return { organization: hit };
  }
);

export async function fetchOrgMembers(
  organizationId: string
): Promise<OrgMemberRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data: members, error: me } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", organizationId);

  if (me) throw supabaseErrorToError(me);
  const ids = (members ?? []).map((m) => m.user_id);
  if (ids.length === 0) return [];

  const { data: users, error: ue } = await supabase
    .from("users")
    .select("id, name, email, created_at, department")
    .in("id", ids);

  if (ue) throw supabaseErrorToError(ue);

  const roleByUser = new Map(
    (members ?? []).map((m) => [m.user_id as string, m.role as OrgRole])
  );

  return (users ?? []).map((u) => ({
    id: u.id as string,
    name: u.name as string | null,
    email: u.email as string | null,
    created_at: u.created_at as string,
    org_role: roleByUser.get(u.id as string) ?? "org_worker",
    department: (u.department as string | null) ?? null,
  }));
}

export async function fetchPendingInvitations(
  organizationId: string
): Promise<
  {
    id: string;
    email: string;
    role: OrgRole;
    status: "invited" | "registered";
    expires_at: string;
    created_at: string;
  }[]
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role, status, expires_at, created_at")
    .eq("organization_id", organizationId)
    .in("status", ["invited", "registered"])
    .order("created_at", { ascending: false });

  if (error) throw supabaseErrorToError(error);
  return (data ?? []) as {
    id: string;
    email: string;
    role: OrgRole;
    status: "invited" | "registered";
    expires_at: string;
    created_at: string;
  }[];
}

export async function fetchSubscription(
  organizationId: string
): Promise<{
  plan: string;
  status: string;
} | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw supabaseErrorToError(error);
  if (!data) return null;
  return data as { plan: string; status: string };
}

/** Parse RPC result from list orgs (when called as raw query alternative) */
