import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getCurrentUserProfile,
  getSessionUser,
  userOnboardingCompleted,
} from "@/lib/auth";
import { getOrganizationsForUser } from "@/lib/organizations";
import { LoginForm } from "./login-form";
import { LoggedInPanel } from "./logged-in-panel";

function LoginFallback() {
  return (
    <div className="w-full max-w-md rounded-xl border border-border/80 bg-card p-8 shadow-md space-y-4">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export default async function LoginPage() {
  const user = await getSessionUser();
  let continueHref = "/onboarding";
  if (user) {
    try {
      const profile = await getCurrentUserProfile();
      if (!userOnboardingCompleted(profile)) {
        continueHref = "/onboarding";
      } else {
        const orgs = await getOrganizationsForUser();
        if (orgs.length > 0) {
          continueHref = `/${orgs[0].slug}/dashboard`;
        }
      }
    } catch {
      /* keep /onboarding */
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
      {user ? (
        <LoggedInPanel continueHref={continueHref} />
      ) : (
        <Suspense fallback={<LoginFallback />}>
          <LoginForm />
        </Suspense>
      )}
    </div>
  );
}
