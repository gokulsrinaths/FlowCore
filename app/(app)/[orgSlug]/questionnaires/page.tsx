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
      <PageBackLink href={`/${orgSlug}/dashboard`} label="Back to home" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Task questions</h1>
        <p className="text-muted-foreground text-sm mt-1 max-w-xl">
          A <strong className="text-foreground font-medium">questionnaire</strong> here is a question
          tied to a task — accept it, write your answer, and send it for review when you’re done.
        </p>
      </div>
      <MyQuestionnairesList rows={rows} organizationId={orgId} orgSlug={orgSlug} />
    </div>
  );
}
