import { Skeleton } from "@/components/ui/skeleton";

export default function ItemsLoading() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between gap-4">
        <Skeleton className="h-16 flex-1 max-w-md" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-4 lg:grid-cols-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[420px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
