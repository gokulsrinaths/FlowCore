import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

export function PageBackLink({
  href,
  label = "Back",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "mb-1 inline-flex min-h-11 touch-manipulation items-center gap-2 text-muted-foreground sm:min-h-0"
      )}
    >
      <ArrowLeft className="size-4 shrink-0" />
      {label}
    </Link>
  );
}
