import { Skeleton } from "@/components/ui/skeleton";

/** Shown while switching workspace or loading org-scoped pages without a closer loading.tsx */
export default function OrgScopeLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-56 max-w-full" />
      <Skeleton className="h-[min(24rem,50vh)] w-full rounded-xl" />
    </div>
  );
}
