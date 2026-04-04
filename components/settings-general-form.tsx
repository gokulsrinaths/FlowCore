"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateOrganizationName } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function GeneralSettingsForm({
  organizationId,
  orgSlug,
  initialName,
  disabled,
}: {
  organizationId: string;
  orgSlug: string;
  initialName: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await updateOrganizationName(organizationId, orgSlug, name);
      if (res.ok) {
        toast.success("Workspace name saved");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not save");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="org-name">Workspace name</Label>
        <Input
          id="org-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={disabled || pending}
        />
      </div>
      <Button
        type="submit"
        className="w-full sm:w-auto"
        disabled={disabled || pending}
      >
        Save
      </Button>
      {disabled && (
        <p className="text-xs text-muted-foreground">
          Only owners and admins can rename the workspace.
        </p>
      )}
    </form>
  );
}
