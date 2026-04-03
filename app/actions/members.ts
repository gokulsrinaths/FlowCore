"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";
import type { OrgRole } from "@/types";

export type MemberActionResult = { ok: true } | { ok: false; error: string };

function catchErr(e: unknown): MemberActionResult {
  return {
    ok: false,
    error: e instanceof Error ? e.message : "Something went wrong",
  };
}

export async function updateMemberRole(
  organizationId: string,
  orgSlug: string,
  userId: string,
  role: OrgRole
): Promise<MemberActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_update_member_role", {
      p_organization_id: organizationId,
      p_target: userId,
      p_new_role: role,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    revalidatePath(`/${orgSlug}/settings/team`);
    revalidatePath(`/${orgSlug}/activity`);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

export async function removeMember(
  organizationId: string,
  orgSlug: string,
  userId: string
): Promise<MemberActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_remove_member", {
      p_organization_id: organizationId,
      p_target: userId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    revalidatePath(`/${orgSlug}/settings/team`);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

export async function leaveOrganization(
  organizationId: string,
  orgSlug: string
): Promise<MemberActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_leave_organization", {
      p_organization_id: organizationId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}
