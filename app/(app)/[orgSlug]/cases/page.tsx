import { CaseStatusBadge } from "@/components/case-status-badge";
import { CreateCaseDialog } from "@/components/create-case-dialog";
import {
  Card,
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
import { fetchCasesForOrg } from "@/lib/cases";
import { getOrgMembershipBySlug } from "@/lib/organizations";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type PageProps = { params: Promise<{ orgSlug: string }> };

async function CasesContent({ orgSlug }: { orgSlug: string }) {
  const membership = await getOrgMembershipBySlug(orgSlug);
  if (!membership) notFound();

  const orgId = membership.organization.id;
  const cases = await fetchCasesForOrg(orgId);

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cases</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Domain cases — tasks stay generic and link here when needed.
          </p>
        </div>
        <CreateCaseDialog organizationId={orgId} orgSlug={orgSlug} />
      </div>

      {cases.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">No cases yet</CardTitle>
            <CardDescription>
              No cases yet — create your first investigation
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="rounded-xl border border-border/80 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="hidden sm:table-cell">Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Tasks</TableHead>
                <TableHead className="hidden md:table-cell text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/${orgSlug}/cases/${c.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {c.title}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                    {c.crime_number ?? "—"}
                  </TableCell>
                  <TableCell>
                    <CaseStatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.itemCount}</TableCell>
                  <TableCell className="hidden md:table-cell text-right text-sm text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

function CasesLoading() {
  return (
    <>
      <div className="flex justify-between gap-4">
        <Skeleton className="h-16 flex-1 max-w-md" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </>
  );
}

export default async function CasesPage({ params }: PageProps) {
  const { orgSlug } = await params;

  return (
    <div className="space-y-8">
      <Suspense fallback={<CasesLoading />}>
        <CasesContent orgSlug={orgSlug} />
      </Suspense>
    </div>
  );
}
