import type { VariantProps } from "class-variance-authority";
import { badgeVariants } from "@/components/ui/badge";

/** Maps free-text priority to badge variant for quick scanning */
export function priorityVariant(
  priority: string | null | undefined
): VariantProps<typeof badgeVariants>["variant"] {
  const p = (priority ?? "").toLowerCase();
  if (p === "urgent") return "destructive";
  if (p === "high") return "default";
  if (p === "medium") return "secondary";
  return "outline";
}
