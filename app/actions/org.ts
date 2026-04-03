"use server";

import { revalidatePath } from "next/cache";
import { buildInviteUrl } from "@/lib/app-url";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";
import { canCreateInvite } from "@/lib/usage";
import type { OrgRole } from "@/types";

export type OrgActionResult =
  | {
      ok: true;
      slug?: string;
      id?: string;
      token?: string;
      /** Share manually with the invitee */
      inviteUrl?: string;
    }
  | { ok: false; error: string };

function catchErr(e: unknown): OrgActionResult {
  return {
    ok: false,
    error: e instanceof Error ? e.message : "Something went wrong",
  };
}

export async function createOrganizationAction(
  formData: FormData
): Promise<OrgActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const name = String(formData.get("name") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const primaryUseCase = String(formData.get("primary_use_case") ?? "").trim();
    const displayName = String(formData.get("display_name") ?? "").trim();

    const { data, error } = await supabase.rpc("flowcore_create_organization", {
      p_name: name,
      p_slug: slug,
      p_primary_use_case: primaryUseCase,
      p_display_name: displayName,
    });

    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    const out = r as { slug?: string; id?: string };
    revalidatePath("/onboarding");
    return { ok: true, slug: out.slug, id: out.id };
  } catch (e) {
    return catchErr(e);
  }
}

export async function updateOrganizationName(
  organizationId: string,
  orgSlug: string,
  name: string
): Promise<OrgActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_update_organization", {
      p_organization_id: organizationId,
      p_name: name.trim(),
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    revalidatePath(`/${orgSlug}/settings/general`);
    revalidatePath(`/${orgSlug}/dashboard`);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

export async function createInvitationAction(
  organizationId: string,
  orgSlug: string,
  formData: FormData
): Promise<OrgActionResult> {
  try {
    const usage = await canCreateInvite(organizationId);
    if (!usage.ok) return { ok: false, error: usage.error };

    const supabase = await createSupabaseServerClient();
    const email = String(formData.get("email") ?? "").trim();
    const role = String(formData.get("role") ?? "org_worker").trim() as OrgRole;

    const { data, error } = await supabase.rpc("flowcore_create_invitation", {
      p_organization_id: organizationId,
      p_email: email,
      p_role: role,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    const tok = (r as { token?: string }).token;
    const inviteUrl = tok ? buildInviteUrl(tok) : undefined;

    revalidatePath(`/${orgSlug}/settings/team`);
    return { ok: true, token: tok, inviteUrl };
  } catch (e) {
    return catchErr(e);
  }
}

export async function cancelInvitationAction(
  organizationId: string,
  orgSlug: string,
  invitationId: string
): Promise<OrgActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_cancel_invitation", {
      p_organization_id: organizationId,
      p_invitation_id: invitationId,
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

export async function seedDemoItemsAction(
  organizationId: string,
  orgSlug: string
): Promise<OrgActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_seed_demo_items", {
      p_organization_id: organizationId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };

    revalidatePath(`/${orgSlug}/items`);
    revalidatePath(`/${orgSlug}/dashboard`);
    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}
