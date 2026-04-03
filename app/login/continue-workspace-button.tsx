"use client";

import { Button } from "@/components/ui/button";

/**
 * Full page navigation — reliable when Next.js client `<Link>` soft nav appears to do nothing
 * (e.g. after browser-based sign-in or with dynamic `[orgSlug]` routes).
 */
export function ContinueWorkspaceButton({ href }: { href: string }) {
  const safe =
    typeof href === "string" &&
    href.startsWith("/") &&
    !href.startsWith("//");

  if (!safe) {
    return (
      <p className="text-sm text-destructive">
        Invalid workspace link. Try signing out, then sign in again.
      </p>
    );
  }

  return (
    <Button
      type="button"
      className="w-full"
      onClick={() => {
        window.location.assign(href);
      }}
    >
      Continue to workspace
    </Button>
  );
}
