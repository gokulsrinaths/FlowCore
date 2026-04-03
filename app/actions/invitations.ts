"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";
import type { OrgRole, PendingInvitationRow } from "@/types";

export type InvitationActionResult =
  | { ok: true; slug?: string }
  | { ok: false; error: string };

function parseInvitationListRpc(data: unknown): PendingInvitationRow[] {
  if (data == null || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const raw = o.invitations;
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const x = row as Record<string, unknown>;
    return {
      id: String(x.id),
      organization_id: String(x.organization_id),
      organization_name: String(x.organization_name ?? ""),
      case_id: x.case_id != null ? String(x.case_id) : null,
      case_title: x.case_title != null ? String(x.case_title) : null,
      role: x.role as OrgRole,
      invited_by_name: String(x.invited_by_name ?? ""),
      invited_by_email: String(x.invited_by_email ?? ""),
      email: String(x.email ?? ""),
      created_at: String(x.created_at ?? ""),
      expires_at: String(x.expires_at ?? ""),
      token: String(x.token ?? ""),
      status: String(x.status ?? "pending") as PendingInvitationRow["status"],
    };
  });
}

export async function fetchUserInvitationsAction(): Promise<
  | { ok: true; invitations: PendingInvitationRow[] }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      "flowcore_list_my_pending_invitations"
    );
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, invitations: parseInvitationListRpc(data) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed",
    };
  }
}

/** Accept invitation from /invitations (by row id). */
export async function acceptInvitationAction(
  invitationId: string
): Promise<InvitationActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      "flowcore_accept_invitation_by_id",
      { p_invitation_id: invitationId }
    );
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    const out = r as { slug?: string };
    revalidatePath("/invitations");
    revalidatePath("/");
    if (out.slug) {
      revalidatePath(`/${out.slug}`, "layout");
    }
    return { ok: true, slug: out.slug };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed",
    };
  }
}

/** Accept from email/token link (`/invite/[token]`). */
export async function acceptInvitationByTokenAction(
  token: string
): Promise<InvitationActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_accept_invitation", {
      p_token: token.trim(),
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    const out = r as { slug?: string };
    revalidatePath("/invitations");
    revalidatePath("/");
    if (out.slug) {
      revalidatePath(`/${out.slug}`, "layout");
    }
    return { ok: true, slug: out.slug };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed",
    };
  }
}

export async function rejectInvitationAction(
  invitationId: string
): Promise<InvitationActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_reject_invitation", {
      p_invitation_id: invitationId,
    });
    if (error) return { ok: false, error: error.message };
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath("/invitations");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed",
    };
  }
}
