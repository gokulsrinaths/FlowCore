import { FormFillView } from "@/components/form-fill-view";
import { PageBackLink } from "@/components/page-back-link";
import { fetchFormTemplateById } from "@/lib/forms";
import { getOrgMembershipBySlug } from "@/lib/organizations";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{ orgSlug: string; formId: string }>;
  searchParams: Promise<{ caseId?: string }>;
};

export default async function FormFillPage({ params, searchParams }: PageProps) {
  const { orgSlug, formId } = await params;
  const { caseId: caseIdParam } = await searchParams;
  const membership = await getOrgMembershipBySlug(orgSlug);
  if (!membership) notFound();

  const form = await fetchFormTemplateById(membership.organization.id, formId);
  if (!form) notFound();

  const caseId = caseIdParam?.trim() || null;

  return (
    <div className="space-y-6">
      <PageBackLink href={`/${orgSlug}/forms/${formId}`} label="Back to form" />
      <FormFillView
        organizationId={membership.organization.id}
        orgSlug={orgSlug}
        form={form}
        caseId={caseId}
      />
    </div>
  );
}
