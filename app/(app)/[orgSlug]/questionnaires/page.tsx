import { MyQuestionnairesList } from "@/components/my-questionnaires-list";
import { PageBackLink } from "@/components/page-back-link";
import { getCurrentUserProfile } from "@/lib/auth";
import { fetchMyItemQuestionnaires } from "@/lib/item-questionnaires";
import { getOrgMembershipBySlug } from "@/lib/organizations";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ orgSlug: string }> };

export default async function QuestionnairesPage({ params }: PageProps) {
  const { orgSlug } = await params;
  const [membership, profile] = await Promise.all([
    getOrgMembershipBySlug(orgSlug),
    getCurrentUserProfile(),
  ]);
  if (!membership || !profile) notFound();

  const orgId = membership.organization.id;
  const rows = await fetchMyItemQuestionnaires(orgId);

  return (
    <div className="space-y-6 max-w-2xl">
      <PageBackLink href={`/${orgSlug}/dashboard`} label="Back to dashboard" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Questionnaires</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Questions assigned to you on items. Accept, answer, and submit for review.
        </p>
      </div>
      <MyQuestionnairesList rows={rows} organizationId={orgId} orgSlug={orgSlug} />
    </div>
  );
}
