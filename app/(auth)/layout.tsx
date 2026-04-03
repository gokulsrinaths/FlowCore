import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

/**
 * Auth-only routes (e.g. onboarding). Ensures session.
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
  return <>{children}</>;
}
