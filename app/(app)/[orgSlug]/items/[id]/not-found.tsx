import Link from "next/link";

export default function ItemNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <h1 className="text-xl font-semibold">Item not found</h1>
      <p className="text-muted-foreground text-sm max-w-sm">
        This item may have been removed or the link is incorrect.
      </p>
      <Link
        href=".."
        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
      >
        Back to items
      </Link>
    </div>
  );
}
