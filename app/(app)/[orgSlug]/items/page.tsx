import { CreateItemDialog } from "@/components/create-item-dialog";
import { KanbanBoard } from "@/components/kanban-board";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUserProfile } from "@/lib/auth";
import { fetchCasesForOrg } from "@/lib/cases";
import { fetchItemsWithUsers, fetchUsersForOrg } from "@/lib/db";
import { getOrgMembershipBySlug } from "@/lib/organizations";
import { notFound } from "next/navigation";
import { Suspense } from "react";

type PageProps = { params: Promise<{ orgSlug: string }> };

async function ItemsContent({ orgSlug }: { orgSlug: string }) {
  const membership = await getOrgMembershipBySlug(orgSlug);
  const profile = await getCurrentUserProfile();
  if (!membership || !profile) return null;

  const orgId = membership.organization.id;
  const [items, users, cases] = await Promise.all([
    fetchItemsWithUsers(orgId),
    fetchUsersForOrg(orgId),
    fetchCasesForOrg(orgId),
  ]);
  const caseOptions = cases.map((c) => ({ id: c.id, title: c.title }));

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Items</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Drag cards between columns or use the status control on each card.
          </p>
        </div>
        <CreateItemDialog
          users={users}
          profile={profile}
          organizationId={orgId}
          orgSlug={orgSlug}
          orgRole={membership.organization.role}
          cases={caseOptions}
        />
      </div>
      <KanbanBoard
        items={items}
        users={users}
        orgRole={membership.organization.role}
        organizationId={orgId}
        orgSlug={orgSlug}
      />
    </>
  );
}

function ItemsLoading() {
  return (
    <>
      <div className="flex justify-between gap-4">
        <Skeleton className="h-16 flex-1 max-w-md" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-4 lg:grid-cols-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[420px] rounded-xl" />
        ))}
      </div>
    </>
  );
}

export default async function ItemsPage({ params }: PageProps) {
  const { orgSlug } = await params;
  const membership = await getOrgMembershipBySlug(orgSlug);
  if (!membership) notFound();

  return (
    <div className="space-y-8">
      <Suspense fallback={<ItemsLoading />}>
        <ItemsContent orgSlug={orgSlug} />
      </Suspense>
    </div>
  );
}
