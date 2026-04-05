"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";
import type {
  InvitationInboxItem,
  InvitationListRow,
  OrgRole,
  UserInvitationsGrouped,
  UserInvitationsInbox,
} from "@/types";

export type InvitationActionResult =
  | { ok: true; slug?: string }
  | { ok: false; error: string };

function parseInvitationRow(row: unknown): InvitationListRow | null {
  if (row == null || typeof row !== "object") return null;
  const x = row as Record<string, unknown>;
  const id = x.id != null ? String(x.id) : "";
  if (!id) return null;
  return {
    id,
    organization_id: String(x.organization_id ?? ""),
    organization_name: String(x.organization_name ?? ""),
    organization_slug:
      x.organization_slug != null ? String(x.organization_slug) : undefined,
    case_id: x.case_id != null ? String(x.case_id) : null,
    case_title: x.case_title != null ? String(x.case_title) : null,
    role: x.role as OrgRole,
    invited_by_name: String(x.invited_by_name ?? ""),
    invited_by_email: String(x.invited_by_email ?? ""),
    email: String(x.email ?? ""),
    created_at: String(x.created_at ?? ""),
    expires_at: String(x.expires_at ?? ""),
    token: String(x.token ?? ""),
    status: String(x.status ?? "invited") as InvitationListRow["status"],
  };
}

function mapListRowToInboxItem(row: InvitationListRow): InvitationInboxItem {
  const slug = row.organization_slug?.trim();
  return {
    id: row.id,
    status: row.status,
    case_title: row.case_title,
    org_name: row.organization_name,
    org_slug: slug ? slug : undefined,
    created_at: row.created_at,
    token: row.token?.trim() ? row.token : undefined,
  };
}

function mapGroupedToInbox(g: UserInvitationsGrouped): UserInvitationsInbox {
  return {
    pending: g.pending.map(mapListRowToInboxItem),
    accepted: g.accepted.map(mapListRowToInboxItem),
    rejected: g.rejected.map(mapListRowToInboxItem),
  };
}

/** Invitations for the signed-in user’s email (via RPC); org/case names included. */
export async function fetchUserInvitationsInboxAction(): Promise<
  | { ok: true; invitations: UserInvitationsInbox }
  | { ok: false; error: string }
> {
  const res = await fetchUserInvitationsAction();
  if (!res.ok) return res;
  return { ok: true, invitations: mapGroupedToInbox(res.invitations) };
}

/** Pending count (invited + registered, non-expired) for nav badge. */
export async function getPendingInvitationCountForNav(): Promise<number> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_count_my_pending_invitations");
    if (error || data == null) return 0;
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return 0;
    const o = data as Record<string, unknown>;
    return typeof o.count === "number" ? o.count : Number(o.count ?? 0);
  } catch {
    return 0;
  }
}

function parseGroupedInvitations(data: unknown): UserInvitationsGrouped {
  const empty: UserInvitationsGrouped = {
    pending: [],
    accepted: [],
    rejected: [],
  };
  if (data == null || typeof data !== "object") return empty;
  const o = data as Record<string, unknown>;
  function arr(key: string): InvitationListRow[] {
    const raw = o[key];
    if (!Array.isArray(raw)) return [];
    const out: InvitationListRow[] = [];
    for (const row of raw) {
      const p = parseInvitationRow(row);
      if (p) out.push(p);
    }
    return out;
  }
  return {
    pending: arr("pending"),
    accepted: arr("accepted"),
    rejected: arr("rejected"),
  };
}

export async function fetchUserInvitationsAction(): Promise<
  | { ok: true; invitations: UserInvitationsGrouped }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_list_my_invitations");
    if (error) {
      const msg = error.message;
      if (
        /flowcore_list_my_invitations|schema cache/i.test(msg) &&
        /function|schema cache/i.test(msg)
      ) {
        return {
          ok: false,
          error:
            "Database is missing RPC flowcore_list_my_invitations (or the API schema cache is stale). Apply Supabase migrations through 018 or run migration 023, then in the Supabase dashboard use API settings to reload the schema if the error persists.",
        };
      }
      return { ok: false, error: msg };
    }
    const r = parseFlowcoreRpc(data);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, invitations: parseGroupedInvitations(data) };
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
    // Bust cached shells for *all* org routes so the workspace switcher picks up the new membership
    // (revalidating only /{slug} leaves the current org’s layout stale).
    revalidatePath("/", "layout");
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

/** Accept from invite link (`/invite/[token]`). */
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
    revalidatePath("/", "layout");
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
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed",
    };
  }
}
