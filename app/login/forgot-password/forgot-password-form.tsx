"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { forgotPasswordAction } from "@/app/actions/auth";
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

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("email", email.trim());
    start(async () => {
      const res = await forgotPasswordAction(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("If an account exists for that email, we sent a reset link.", {
        description: "Check your inbox and spam folder.",
      });
    });
  }

  return (
    <Card className="w-full max-w-md shadow-md">
      <CardHeader className="space-y-1">
        <Link
          href="/"
          className="text-xl font-semibold tracking-tight transition-colors hover:text-primary"
        >
          FlowCore
        </Link>
        <CardTitle className="text-lg">Forgot password</CardTitle>
        <CardDescription className="text-pretty">
          Enter your email. We&apos;ll send a link to set a new password if an account exists.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/login" className="underline-offset-4 hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
