"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { acceptInvitationByTokenAction } from "@/app/actions/invitations";
import { Button } from "@/components/ui/button";

export function AcceptInviteButton({ token }: { token: string }) {
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const res = await acceptInvitationByTokenAction(token);
      if (res.ok && res.slug) {
        toast.success("Joined workspace");
        window.location.assign(`/${res.slug}/dashboard`);
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
