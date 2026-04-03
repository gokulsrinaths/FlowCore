"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Building2, ChevronsUpDown, Loader2 } from "lucide-react";
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
 */
function hrefForWorkspaceSwitch(
  pathname: string,
  currentSlug: string,
  nextSlug: string
): string {
  const trimmed = pathname.split("?")[0] ?? pathname;
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length === 0) return `/${nextSlug}/dashboard`;
  if (parts[0] === currentSlug) {
    parts[0] = nextSlug;
    return "/" + parts.join("/");
  }
  return `/${nextSlug}/dashboard`;
}

export function OrgSwitcher({
  current,
  organizations,
}: {
  current: OrganizationWithRole;
  organizations: OrganizationWithRole[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function goToWorkspace(slug: string) {
    const href = hrefForWorkspaceSwitch(pathname, current.slug, slug);
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full justify-between gap-2 h-auto py-2 px-2.5 font-normal",
          pending && "opacity-80 pointer-events-none"
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          {pending ? (
            <Loader2 className="size-4 shrink-0 text-muted-foreground animate-spin" />
          ) : (
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-left text-sm font-medium">{current.name}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
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
                disabled={pending}
                onSelect={() => goToWorkspace(o.slug)}
                onMouseEnter={() => router.prefetch(href)}
              >
                <span className="truncate">{o.name}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onSelect={() =>
            startTransition(() => {
              router.push("/onboarding");
            })
          }
        >
          Create workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
