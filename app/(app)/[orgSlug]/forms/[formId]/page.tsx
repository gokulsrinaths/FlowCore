import { FormBuilderEditor } from "@/components/form-builder-editor";
import { PageBackLink } from "@/components/page-back-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchFormSubmissions, fetchFormTemplateById } from "@/lib/forms";
import { sortedFormFields } from "@/lib/form-template-logic";
import { getOrgMembershipBySlug } from "@/lib/organizations";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ orgSlug: string; formId: string }> };

export default async function FormDetailPage({ params }: PageProps) {
  const { orgSlug, formId } = await params;
  const membership = await getOrgMembershipBySlug(orgSlug);
  if (!membership) notFound();

  const orgId = membership.organization.id;
  const [form, submissions] = await Promise.all([
    fetchFormTemplateById(orgId, formId),
    fetchFormSubmissions(orgId, formId, 200),
  ]);

  if (!form) notFound();

  const base = `/${orgSlug}/forms`;
  const fieldOrder = sortedFormFields(form.fields);

  return (
    <div className="space-y-10 max-w-4xl">
      <PageBackLink href={base} label="Back to forms" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit form</h1>
          <p className="text-muted-foreground text-sm mt-1">{form.title}</p>
        </div>
        <Link
          href={`${base}/${formId}/fill`}
          className={cn(buttonVariants({ variant: "outline" }), "w-full justify-center sm:w-auto")}
        >
          Fill out (respond)
        </Link>
      </div>

      <FormBuilderEditor
        key={form.id}
        organizationId={orgId}
        orgSlug={orgSlug}
        mode="edit"
        formId={form.id}
        initialTitle={form.title}
        initialDescription={form.description ?? ""}
        initialFields={form.fields}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Responses</CardTitle>
          <CardDescription>
            Latest submissions ({submissions.length} shown). Answers are keyed by question id.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No responses yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  {fieldOrder.map((f) => (
                    <TableHead key={f.id} className="min-w-[8rem] max-w-[14rem] truncate">
                      {f.label || f.id.slice(0, 8)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(s.created_at).toLocaleString()}
                    </TableCell>
                    {fieldOrder.map((f) => {
                      const v = s.answers[f.id];
                      let display: string;
                      if (v == null) display = "—";
                      else if (Array.isArray(v)) display = v.join(", ");
                      else display = String(v);
                      return (
                        <TableCell
                          key={f.id}
                          className="text-sm max-w-[14rem] align-top break-words"
                        >
                          {display}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
