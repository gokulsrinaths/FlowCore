type OnboardingProfile = {
  onboarding_completed?: boolean | null;
};

export function isOnboardingComplete(profile: OnboardingProfile | null): boolean {
  if (!profile) return false;
  return profile.onboarding_completed !== false;
}

export function getPrimaryOrgDashboardHref(orgSlugs: readonly string[]): string | null {
  return orgSlugs.length > 0 ? `/${orgSlugs[0]}/dashboard` : null;
}

export function resolvePostLoginContinueHref(
  profile: OnboardingProfile | null,
  orgSlugs: readonly string[]
): string {
  if (!isOnboardingComplete(profile)) {
    return "/onboarding";
  }

  return getPrimaryOrgDashboardHref(orgSlugs) ?? "/onboarding";
}

export function resolveOnboardingDestination(
  profile: OnboardingProfile | null,
  orgSlugs: readonly string[]
):
  | { kind: "login" }
  | { kind: "dashboard"; href: string }
  | { kind: "create-workspace" }
  | { kind: "profile-onboarding" } {
  if (!profile) {
    return { kind: "login" };
  }

  if (isOnboardingComplete(profile)) {
    const href = getPrimaryOrgDashboardHref(orgSlugs);
    if (href) {
      return { kind: "dashboard", href };
    }
    return { kind: "create-workspace" };
  }

  return { kind: "profile-onboarding" };
}

export function resolveWorkspaceFallbackHref(orgSlugs: readonly string[]): string {
  return getPrimaryOrgDashboardHref(orgSlugs) ?? "/onboarding";
}
