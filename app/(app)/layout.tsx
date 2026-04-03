import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";
import {
  acceptPendingInvitations,
  getCurrentUserProfile,
  getSessionUser,
  userOnboardingCompleted,
} from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Authenticated app shell (org routes). Ensures public.users exists after auth.
 */
export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  let profile = await getCurrentUserProfile();
  if (!profile) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("flowcore_ensure_profile");
    if (error) {
      // Session is valid; /login would loop — send to onboarding to finish setup
      redirect("/onboarding");
    }
    const r = parseFlowcoreRpc(data);
    if (!r.ok) {
      redirect("/onboarding");
    }
    profile = await getCurrentUserProfile();
  }

  if (!profile) {
    redirect("/onboarding");
  }

  await acceptPendingInvitations();

  if (!userOnboardingCompleted(profile)) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
