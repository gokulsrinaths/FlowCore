"use client";

import { usePathname, useRouter } from "next/navigation";
import { Building2, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import type { OrganizationWithRole } from "@/types";

/**
 * Keep the same area (cases, items, settings, …) when changing workspace instead of
 * always jumping to dashboard — feels much smoother.
 *
 * First segment match is case-insensitive so we still rewrite the URL if the path casing
 * differs from `current.slug`.
 */
function hrefForWorkspaceSwitch(
  pathname: string,
  currentSlug: string,
  nextSlug: string
): string {
  const trimmed = pathname.split("?")[0] ?? pathname;
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length === 0) return `/${nextSlug}/dashboard`;
  if (parts[0].toLowerCase() === currentSlug.toLowerCase()) {
    parts[0] = nextSlug;
    return "/" + parts.join("/");
  }
  return `/${nextSlug}/dashboard`;
}

export function OrgSwitcher({
  current,
  organizations,
  triggerClassName,
}: {
  current: OrganizationWithRole;
  organizations: OrganizationWithRole[];
  /** Merged onto the dropdown trigger (e.g. width constraints in the top bar). */
  triggerClassName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function goToWorkspace(slug: string) {
    if (slug.toLowerCase() === current.slug.toLowerCase()) return;
    const href = hrefForWorkspaceSwitch(pathname, current.slug, slug);
    // Full navigation — soft router.push often fails to refresh `[orgSlug]` layout params
    // (same issue as login "Continue to workspace"). Hard assign guarantees the new org.
    window.location.assign(href);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "outline" }),
          "min-h-11 w-full touch-manipulation justify-between gap-2 py-2.5 pl-3 pr-2 font-normal h-auto",
          triggerClassName
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Building2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-left text-sm font-medium">{current.name}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Workspaces
          </DropdownMenuLabel>
          {organizations.map((o) => {
            const href = hrefForWorkspaceSwitch(pathname, current.slug, o.slug);
            return (
              <DropdownMenuItem
                key={o.id}
                className={o.id === current.id ? "bg-accent" : ""}
                onSelect={() => goToWorkspace(o.slug)}
                onMouseEnter={() => router.prefetch(href)}
              >
                <span className="truncate">{o.name}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/onboarding")}>
          Create workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
