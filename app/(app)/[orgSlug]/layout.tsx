import { AppShell } from "@/components/app-shell";
import { getCurrentUserProfile } from "@/lib/auth";
import { getOrgMembershipBySlug } from "@/lib/organizations";
import { notFound } from "next/navigation";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const [membership, profile] = await Promise.all([
    getOrgMembershipBySlug(orgSlug),
    getCurrentUserProfile(),
  ]);
  if (!membership || !profile) {
    notFound();
  }

  return (
    <AppShell
      organization={membership.organization}
      profile={profile}
    >
      {children}
    </AppShell>
  );
}
