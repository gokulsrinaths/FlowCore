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
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Create your workspace</h1>
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
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Complete your profile</h1>
          <p className="text-sm text-muted-foreground">
            A few details help teammates recognize you on cases and tasks.
          </p>
        </div>
        <ProfileOnboardingForm />
      </div>
    </div>
  );
}
