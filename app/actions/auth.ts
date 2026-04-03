"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";

export type AuthActionResult =
  | { ok: true }
  | { ok: false; error: string };

function catchErr(e: unknown): AuthActionResult {
  return {
    ok: false,
    error: e instanceof Error ? e.message : "Something went wrong",
  };
}

function parseOrgList(data: unknown): { slug: string }[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data as { slug: string }[];
  if (typeof data === "string") {
    try {
      const p = JSON.parse(data);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

export type FinalizeSignInResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

/**
 * Only allow same-origin relative paths (e.g. /invite/abc, /onboarding).
 */
function safeNextPath(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return null;
  if (t.includes("://")) return null;
  if (/[\r\n]/.test(t)) return null;
  return t;
}

/**
 * Call after the browser client has signed in (cookies are set in the browser).
 * Server-only sign-in did not reliably persist refresh tokens; client sign-in + this
 * keeps sessions across refresh and returning visits.
 *
 * @param nextPath — optional redirect from `?next=` (e.g. return to `/invite/[token]`).
 */
export async function finalizeSignInSessionAction(
  nextPath?: string | null
): Promise<FinalizeSignInResult> {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Session not ready. Try signing in again.",
    };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "flowcore_ensure_profile"
  );
  if (rpcError) {
    return { ok: false, error: rpcError.message };
  }
  const r = parseFlowcoreRpc(rpcData);
  if (!r.ok) {
    return { ok: false, error: r.error };
  }

  await supabase.rpc("flowcore_accept_pending_invitations");

  const preferred = safeNextPath(nextPath);
  if (preferred) {
    return { ok: true, path: preferred };
  }

  const { data: orgData, error: orgErr } = await supabase.rpc(
    "flowcore_list_user_organizations"
  );
  if (orgErr) {
    return { ok: false, error: orgErr.message };
  }
  const orgs = parseOrgList(orgData);
  if (orgs.length === 0) {
    return { ok: true, path: "/onboarding" };
  }
  return { ok: true, path: `/${orgs[0].slug}/dashboard` };
}

export async function signUpAction(formData: FormData): Promise<AuthActionResult> {
  try {
    const email = String(formData.get("email") ?? "")
      .trim()
      .replace(/\r?\n/g, "");
    const password = String(formData.get("password") ?? "");
    if (!email || !password) {
      return { ok: false, error: "Email and password are required" };
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: email.split("@")[0] },
      },
    });
    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (e) {
    return catchErr(e);
  }
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
