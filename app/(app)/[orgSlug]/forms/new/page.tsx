import { FormBuilderEditor } from "@/components/form-builder-editor";
import { PageBackLink } from "@/components/page-back-link";
import { getOrgMembershipBySlug } from "@/lib/organizations";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ orgSlug: string }> };

export default async function NewFormPage({ params }: PageProps) {
  const { orgSlug } = await params;
  const membership = await getOrgMembershipBySlug(orgSlug);
  if (!membership) notFound();

  const orgId = membership.organization.id;

  return (
    <div className="space-y-8 max-w-3xl">
      <PageBackLink href={`/${orgSlug}/forms`} label="Back to forms" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New form</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Add questions, then save. You can attach follow-ups that only appear when a condition is
          met.
        </p>
      </div>
      <FormBuilderEditor
        key="new"
        organizationId={orgId}
        orgSlug={orgSlug}
        mode="create"
        initialTitle=""
        initialDescription=""
        initialFields={[]}
      />
    </div>
  );
}
