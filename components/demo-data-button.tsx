"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { seedDemoItemsAction } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export function DemoDataButton({
  organizationId,
  orgSlug,
}: {
  organizationId: string;
  orgSlug: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const res = await seedDemoItemsAction(organizationId, orgSlug);
      if (res.ok) {
        toast.success("Sample tasks added");
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn’t add sample tasks");
      }
    });
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={run} disabled={pending} className="gap-2">
      <Sparkles className="size-4" />
      {pending ? "Adding…" : "Try sample tasks"}
    </Button>
  );
}
