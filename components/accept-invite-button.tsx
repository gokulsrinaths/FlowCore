"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { acceptInvitationAction } from "@/app/actions/org";
import { Button } from "@/components/ui/button";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const res = await acceptInvitationAction(token);
      if (res.ok && res.slug) {
        toast.success("Joined workspace");
        router.push(`/${res.slug}/dashboard`);
        router.refresh();
      } else {
        toast.error(!res.ok ? res.error : "Could not accept invite");
      }
    });
  }

  return (
    <Button type="button" className="w-full" onClick={run} disabled={pending}>
      {pending ? "Joining…" : "Accept invitation"}
    </Button>
  );
}
