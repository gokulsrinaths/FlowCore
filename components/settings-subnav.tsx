import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

export type SettingsSection = "general" | "team" | "billing";

export function SettingsSubnav({
  orgSlug,
  current,
}: {
  orgSlug: string;
  current: SettingsSection;
}) {
  const base = `/${orgSlug}/settings`;
  const items: { id: SettingsSection; href: string; label: string }[] = [
    { id: "general", href: `${base}/general`, label: "General" },
    { id: "team", href: `${base}/team`, label: "Team" },
    { id: "billing", href: `${base}/billing`, label: "Billing" },
  ];

  return (
    <nav
      className="flex flex-wrap gap-2 border-b border-border/60 pb-4"
      aria-label="Settings sections"
    >
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={cn(
            buttonVariants({
              variant: current === item.id ? "secondary" : "ghost",
              size: "sm",
            }),
            "touch-manipulation"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
