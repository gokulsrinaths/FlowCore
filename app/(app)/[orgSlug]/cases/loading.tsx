import { Skeleton } from "@/components/ui/skeleton";

export default function CasesLoading() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between gap-4">
        <Skeleton className="h-16 flex-1 max-w-md" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
