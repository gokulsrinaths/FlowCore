"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { createOrganizationAction } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const USE_CASES = [
  "operations",
  "compliance",
  "agency_delivery",
  "internal_requests",
  "other",
];

export function OnboardingForm() {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function onSubmit(formData: FormData) {
    start(async () => {
      const res = await createOrganizationAction(formData);
      if (res.ok && res.slug) {
        toast.success("Workspace created");
        router.push(`/${res.slug}/dashboard`);
        router.refresh();
      } else {
        toast.error(!res.ok ? res.error : "Could not create workspace");
      }
    });
  }

  return (
    <form
      action={onSubmit}
      className="space-y-4 rounded-xl border border-border/80 bg-card p-4 shadow-sm sm:p-6"
    >
      <div className="space-y-2">
        <Label htmlFor="name">Workspace name</Label>
        <Input id="name" name="name" required placeholder="Acme Ops" />
        <p className="text-xs text-muted-foreground">
          You will become the workspace owner and can invite teammates from settings.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">Workspace URL</Label>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="shrink-0">…/</span>
          <Input
            id="slug"
            name="slug"
            required
            placeholder="acme-ops"
            pattern="[a-z0-9][a-z0-9-]*"
            className="font-mono text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="display_name">Your display name</Label>
        <Input id="display_name" name="display_name" placeholder="Alex" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="primary_use_case">Primary use case</Label>
        <select
          id="primary_use_case"
          name="primary_use_case"
          className="flex h-11 min-h-11 w-full touch-manipulation rounded-lg border border-input bg-background px-3 py-2 text-sm sm:h-9 sm:min-h-9 sm:py-1"
          defaultValue="operations"
        >
          {USE_CASES.map((u) => (
            <option key={u} value={u}>
              {u.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Continue"}
      </Button>
    </form>
  );
}
