"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { completeOnboardingAction } from "@/app/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const DEPT_SUGGESTIONS = [
  "Operations",
  "Compliance",
  "Investigations",
  "Legal",
  "Finance",
  "IT",
];

export function ProfileOnboardingForm() {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function onSubmit(formData: FormData) {
    start(async () => {
      const res = await completeOnboardingAction(formData);
      if (res.ok) {
        toast.success("Profile saved");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not save");
      }
    });
  }

  return (
    <form
      action={onSubmit}
      className="rounded-xl border border-border/80 bg-card p-6 space-y-4 shadow-sm"
    >
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required placeholder="Your name" autoComplete="name" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="department">Department</Label>
        <Input
          id="department"
          name="department"
          list="flowcore-dept-suggestions"
          placeholder="e.g. Operations"
        />
        <datalist id="flowcore-dept-suggestions">
          {DEPT_SUGGESTIONS.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Role, team, or how you use FlowCore"
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
