import { redirect } from "next/navigation";
import { getCurrentUserProfile, userOnboardingCompleted } from "@/lib/auth";
import { getOrganizationsForUser } from "@/lib/organizations";
import { OnboardingForm } from "@/components/onboarding-form";
import { ProfileOnboardingForm } from "@/components/profile-onboarding-form";

export default async function OnboardingPage() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    redirect("/login");
  }

  const orgs = await getOrganizationsForUser();
  const done = userOnboardingCompleted(profile);

  if (done && orgs.length > 0) {
    redirect(`/${orgs[0].slug}/dashboard`);
  }

  if (done && orgs.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Create your workspace</h1>
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
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Complete your profile</h1>
          <p className="text-sm text-muted-foreground">
            A few details help teammates recognize you on cases and tasks.
          </p>
        </div>
        <ProfileOnboardingForm />
      </div>
    </div>
  );
}
