import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth";
import { getOrganizationsForUser } from "@/lib/organizations";
import { resolveOnboardingDestination } from "@/lib/onboarding-flow";
import { OnboardingForm } from "@/components/onboarding-form";
import { ProfileOnboardingForm } from "@/components/profile-onboarding-form";

export default async function OnboardingPage() {
  const profile = await getCurrentUserProfile();
  const orgs = await getOrganizationsForUser();
  const destination = resolveOnboardingDestination(profile, orgs.map((org) => org.slug));

  if (destination.kind === "login") {
    redirect("/login");
  }

  if (destination.kind === "dashboard") {
    redirect(destination.href);
  }

  if (destination.kind === "create-workspace") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Create your workspace
            </h1>
            <p className="text-sm text-muted-foreground">
              FlowCore organizes work by workspace. You can invite teammates after setup.
            </p>
          </div>
          <OnboardingForm />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Complete your profile
          </h1>
          <p className="text-sm text-muted-foreground">
            A few details help teammates recognize you on cases and tasks.
          </p>
        </div>
        <ProfileOnboardingForm />
      </div>
    </div>
  );
}
