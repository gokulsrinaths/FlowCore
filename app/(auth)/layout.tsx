import { redirect } from "next/navigation";
import { acceptPendingInvitations, getSessionUser } from "@/lib/auth";

/**
 * Auth-only routes (e.g. onboarding). Ensures session and applies pending invitations.
 */
export default async function AuthGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  await acceptPendingInvitations();
  return <>{children}</>;
}
