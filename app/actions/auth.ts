"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";
import { getRequestOrigin } from "@/lib/request-origin";

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
  | { ok: true; path: string; pendingInvitationCount?: number }
  | { ok: false; error: string };

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function countPendingInvitations(supabase: SupabaseServer): Promise<number> {
  const { data, error } = await supabase.rpc("flowcore_count_my_pending_invitations");
  if (error || data == null) return 0;
  const r = parseFlowcoreRpc(data);
  if (!r.ok) return 0;
  const o = data as Record<string, unknown>;
  return typeof o.count === "number" ? o.count : Number(o.count ?? 0);
}

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
 * After a session exists on the server client (cookies set), ensure profile and return where to go.
 */
async function completePostAuthRedirect(
  supabase: SupabaseServer,
  nextPath?: string | null
): Promise<FinalizeSignInResult> {
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

  await supabase.rpc("flowcore_mark_invitation_registered");
  const pendingInvitationCount = await countPendingInvitations(supabase);

  const preferred = safeNextPath(nextPath);
  if (preferred) {
    return { ok: true, path: preferred, pendingInvitationCount };
  }

  const { data: orgData, error: orgErr } = await supabase.rpc(
    "flowcore_list_user_organizations"
  );
  if (orgErr) {
    return { ok: false, error: orgErr.message };
  }
  const orgs = parseOrgList(orgData);
  if (orgs.length === 0) {
    return { ok: true, path: "/onboarding", pendingInvitationCount };
  }
  return {
    ok: true,
    path: `/${orgs[0].slug}/dashboard`,
    pendingInvitationCount,
  };
}

/**
 * Password sign-in on the server so session cookies are set in the same request.
 * (Client signIn + server finalize often races: server never sees cookies yet.)
 */
export async function signInAction(
  formData: FormData,
  nextPath?: string | null
): Promise<FinalizeSignInResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .replace(/\r?\n/g, "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, error: "Email and password are required" };
  }

  let supabase: SupabaseServer;
  try {
    supabase = await createSupabaseServerClient();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, error: error.message };
  }

  return completePostAuthRedirect(supabase, nextPath);
}

/**
 * Use when the session was already established in this cookie store (e.g. OAuth callback).
 * Prefer {@link signInAction} for email/password.
 */
export async function finalizeSignInSessionAction(
  nextPath?: string | null
): Promise<FinalizeSignInResult> {
  let supabase: SupabaseServer;
  try {
    supabase = await createSupabaseServerClient();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }

  return completePostAuthRedirect(supabase, nextPath);
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
    const origin = await getRequestOrigin();
    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/login`,
        data: { name: email.split("@")[0] },
      },
    });
    if (error) {
      return { ok: false, error: error.message };
    }

    if (signUpData.session) {
      await supabase.rpc("flowcore_mark_invitation_registered");
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

export type ForgotPasswordResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Sends Supabase password recovery email. Add `/auth/update-password` to Supabase Auth redirect URLs.
 */
export async function forgotPasswordAction(
  formData: FormData
): Promise<ForgotPasswordResult> {
  try {
    const email = String(formData.get("email") ?? "")
      .trim()
      .replace(/\r?\n/g, "");
    if (!email) {
      return { ok: false, error: "Email is required" };
    }

    const supabase = await createSupabaseServerClient();
    const origin = await getRequestOrigin();
    const redirectTo = `${origin}/auth/update-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}
