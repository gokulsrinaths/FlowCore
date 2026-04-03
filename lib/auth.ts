import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { User, UserRole, UserRow } from "@/types";

/**
 * Returns the current Supabase auth user, or null if not signed in.
 * Cached per request so layout + page don't each pay for getUser().
 */
export const getSessionUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

function parseUserRowFromRpc(data: unknown): UserRow | null {
  if (data == null) return null;
  let o: Record<string, unknown>;
  if (typeof data === "string") {
    try {
      o = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof data === "object" && !Array.isArray(data)) {
    o = data as Record<string, unknown>;
  } else {
    return null;
  }
  if (typeof o.id !== "string") return null;
  const onboarding = o.onboarding_completed;
  return {
    id: o.id,
    name: (o.name as string | null) ?? null,
    email: (o.email as string | null) ?? null,
    role: o.role as UserRow["role"],
    created_at: String(o.created_at ?? ""),
    department: (o.department as string | null) ?? null,
    description: (o.description as string | null) ?? null,
    onboarding_completed:
      typeof onboarding === "boolean" ? onboarding : true,
  };
}

/**
 * Loads the FlowCore profile row (role, name) for the signed-in user.
 * Uses RPC (SECURITY DEFINER) so RLS cannot hide the user's own row after ensure_profile.
 */
export const getCurrentUserProfile = cache(async (): Promise<UserRow | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createSupabaseServerClient();
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    "flowcore_get_my_profile"
  );
  if (!rpcErr) {
    const row = parseUserRowFromRpc(rpcData);
    if (row) return row;
  }

  const { data, error } = await supabase
    .from("users")
    .select(
      "id, name, email, role, created_at, department, description, onboarding_completed"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as UserRow;
});

/**
 * Resolves onboarding flag for UI (defaults to true if column missing).
 */
export function userOnboardingCompleted(profile: UserRow | null): boolean {
  if (!profile) return false;
  return profile.onboarding_completed !== false;
}

/**
 * Maps a profile row to the `User` type used in forms and layouts.
 */
export function toUser(profile: UserRow): User {
  return {
    id: profile.id,
    name: profile.name ?? undefined,
    department: profile.department ?? undefined,
    description: profile.description ?? undefined,
    onboarding_completed: userOnboardingCompleted(profile),
  };
}

/**
 * Throws if not authenticated — use in Server Actions that must be protected.
 */
export async function requireAuthUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

/**
 * Ensures the current user has one of the allowed roles.
 */
export async function requireRole(allowed: UserRole[]) {
  const profile = await getCurrentUserProfile();
  if (!profile || !profile.role || !allowed.includes(profile.role)) {
    throw new Error("Forbidden");
  }
  return profile;
}
