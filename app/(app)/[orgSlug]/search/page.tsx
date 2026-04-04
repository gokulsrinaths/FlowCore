import Link from "next/link";
import { PageBackLink } from "@/components/page-back-link";
import { searchOrg } from "@/lib/db";
import { getOrgMembershipBySlug } from "@/lib/organizations";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ params, searchParams }: PageProps) {
  const { orgSlug } = await params;
  const { q } = await searchParams;
  const membership = await getOrgMembershipBySlug(orgSlug);
  if (!membership) notFound();

  const query = (q ?? "").trim();
  const results =
    query.length >= 2
      ? await searchOrg(membership.organization.id, query)
      : [];

  const base = `/${orgSlug}`;

  return (
    <div className="space-y-8">
      <PageBackLink href={`/${orgSlug}/dashboard`} label="Back to home" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Results for &quot;{query || "…"}&quot; in {membership.organization.name}
        </p>
      </div>

      {query.length > 0 && query.length < 2 && (
        <p className="text-sm text-muted-foreground">Enter at least 2 characters.</p>
      )}

      {results.length === 0 && query.length >= 2 && (
        <p className="text-sm text-muted-foreground">No matches.</p>
      )}

      <div className="space-y-4">
        {results.map((r, i) => (
          <Card key={`${r.type}-${r.id}-${i}`}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium capitalize">{r.type}</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 text-sm">
              {r.type === "item" && (
                <Link
                  href={`${base}/items/${r.id}`}
                  className="inline-block min-h-11 max-w-full py-2 font-medium break-words hover:underline sm:min-h-0 sm:py-0"
                >
                  {r.title}
                </Link>
              )}
              {r.type === "comment" && (
                <div>
                  <p className="text-muted-foreground line-clamp-2">{r.snippet}</p>
                  <Link
                    href={`${base}/items/${r.item_id}`}
                    className="mt-1 inline-flex min-h-11 items-center text-xs text-primary sm:min-h-0"
                  >
                    View item
                  </Link>
                </div>
              )}
              {r.type === "user" && (
                <p>
                  {r.name ?? r.email}{" "}
                  <span className="text-muted-foreground">({r.email})</span>
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
