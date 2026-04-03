"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { signInAction, signUpAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type AuthMode = "signin" | "signup";

/**
 * Open /login for sign-in, /login?signup=1 for create account.
 */
export function LoginForm() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const signup =
      searchParams.get("signup") === "1" || searchParams.get("mode") === "signup";
    if (signup) setMode("signup");
  }, [searchParams]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
        const fd = new FormData();
        fd.set("email", email.trim());
        fd.set("password", password);
        if (mode === "signin") {
          const next = searchParams.get("next");
          const result = await signInAction(fd, next);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("Signed in");
          if (
            result.pendingInvitationCount != null &&
            result.pendingInvitationCount > 0
          ) {
            toast.message("You have pending invitations", {
              description: `Open Invitations in the sidebar (${result.pendingInvitationCount}).`,
            });
          }
          // Full navigation so the browser reliably sends new session cookies (router.push can feel like “nothing happened”).
          const path =
            result.path.startsWith("/") && !result.path.startsWith("//")
              ? result.path
              : "/onboarding";
          window.location.assign(path);
        } else {
          const result = await signUpAction(fd);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(
            "Account created — check your email to confirm if required, then sign in here."
          );
          setMode("signin");
        }
      } finally {
        setLoading(false);
      }
    },
    [email, password, mode, searchParams]
  );

  return (
    <Card className="w-full max-w-md shadow-md">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="text-xl font-semibold tracking-tight hover:text-primary transition-colors"
          >
            FlowCore
          </Link>
        </div>
        <CardTitle className="text-lg sr-only">Account</CardTitle>
        <CardDescription className="text-pretty">
          {mode === "signin"
            ? "Sign in to open your workspace. New here? Use Create account."
            : "Create your account, then you’ll set up or join a workspace."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          className="flex rounded-lg border border-border bg-muted/40 p-1 text-sm"
          role="tablist"
          aria-label="Sign in or create account"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={cn(
              "flex-1 touch-manipulation rounded-md py-2.5 px-3 text-sm font-medium transition-colors min-h-11 sm:min-h-0 sm:py-2",
              mode === "signin"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={cn(
              "flex-1 touch-manipulation rounded-md py-2.5 px-3 text-sm font-medium transition-colors min-h-11 sm:min-h-0 sm:py-2",
              mode === "signup"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMode("signup")}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? "Working…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center">
          <Link href="/" className="underline-offset-4 hover:underline">
            ← Back to home
          </Link>
          {" · "}
          <Link href="/help" className="underline-offset-4 hover:underline">
            Help
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
