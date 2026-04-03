import { Skeleton } from "@/components/ui/skeleton";

export default function ItemDetailLoading() {
  return (
    <div className="space-y-6 max-w-3xl">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
