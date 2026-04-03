import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseFlowcoreRpc } from "@/lib/supabase-rpc";
import { getCurrentUserProfile, getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Authenticated routes that must work before org onboarding completes (e.g. accept invites).
 */
export default async function SessionGroupLayout({
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

  return <>{children}</>;
}
