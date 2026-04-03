"use client";

import { useRouter } from "next/navigation";
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

export function OrgSwitcher({
  current,
  organizations,
}: {
  current: OrganizationWithRole;
  organizations: OrganizationWithRole[];
}) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full justify-between gap-2 h-auto py-2 px-2.5 font-normal"
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Building2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-left text-sm font-medium">{current.name}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Workspaces
          </DropdownMenuLabel>
          {organizations.map((o) => (
            <DropdownMenuItem
              key={o.id}
              className={o.id === current.id ? "bg-accent" : ""}
              onSelect={() => router.push(`/${o.slug}/dashboard`)}
            >
              <span className="truncate">{o.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/onboarding")}>
          Create workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
