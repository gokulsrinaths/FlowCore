import Link from "next/link";
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
import { fetchFormTemplates } from "@/lib/forms";
import { getOrgMembershipBySlug } from "@/lib/organizations";
import { canAdministerWorkspaceRecords } from "@/lib/permissions";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ orgSlug: string }> };

export default async function FormsListPage({ params }: PageProps) {
  const { orgSlug } = await params;
  const membership = await getOrgMembershipBySlug(orgSlug);
  if (!membership) notFound();

  const forms = await fetchFormTemplates(membership.organization.id);
  const base = `/${orgSlug}/forms`;
  const canEditForms = canAdministerWorkspaceRecords(membership.organization.role);

  return (
    <div className="space-y-8">
      <PageBackLink href={`/${orgSlug}/dashboard`} label="Back to dashboard" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Forms</h1>
          <p className="text-muted-foreground text-sm mt-1 text-pretty max-w-xl">
            Build forms with short answers, paragraphs, multiple choice, and conditional follow-up
            questions—similar to Google Forms. Responses are stored per workspace.
            {!canEditForms ? (
              <span className="block mt-2 text-amber-700 dark:text-amber-500/90">
                Only workspace owners and admins can create or edit form structure; everyone can
                fill out forms.
              </span>
            ) : null}
          </p>
        </div>
        {canEditForms ? (
          <Link
            href={`${base}/new`}
            className={cn(buttonVariants(), "w-full justify-center sm:w-auto touch-manipulation")}
          >
            New form
          </Link>
        ) : null}
      </div>

      {forms.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">No forms yet</CardTitle>
            <CardDescription>
              Create a form to collect structured answers with optional branching based on earlier
              answers.
            </CardDescription>
          </CardHeader>
            <CardContent>
            {canEditForms ? (
              <Link
                href={`${base}/new`}
                className={cn(buttonVariants(), "inline-flex touch-manipulation")}
              >
                Create your first form
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ask a workspace owner or admin to create a form you can fill out.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-border/80 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="hidden sm:table-cell">Responses</TableHead>
                <TableHead className="hidden md:table-cell">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col gap-1 items-start">
                      <Link
                        href={`${base}/${f.id}/fill`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {f.title}
                      </Link>
                      {canEditForms ? (
                        <Link
                          href={`${base}/${f.id}`}
                          className="text-xs text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
                        >
                          Edit structure
                        </Link>
                      ) : null}
                    </div>
                    {f.description ? (
                      <p className="text-xs text-muted-foreground font-normal mt-1 line-clamp-2">
                        {f.description}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell tabular-nums text-muted-foreground">
                    {f.response_count}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {new Date(f.updated_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
