import assert from "node:assert/strict";
import {
  getPrimaryOrgDashboardHref,
  isOnboardingComplete,
  resolveOnboardingDestination,
  resolvePostLoginContinueHref,
  resolveWorkspaceFallbackHref,
} from "../lib/onboarding-flow";
import { isAnonymousAccessibleRoute } from "../lib/proxy-routes";

function expectEqual(actual: unknown, expected: unknown, label: string) {
  assert.deepEqual(actual, expected, label);
}

const anonymousRoutes = [
  "/",
  "/pricing",
  "/help",
  "/login",
  "/login/forgot-password",
  "/invite/abc123",
  "/auth/update-password",
];
anonymousRoutes.forEach((route) =>
  expectEqual(isAnonymousAccessibleRoute(route), true, `anonymous route: ${route}`)
);

const protectedRoutes = ["/onboarding", "/invitations", "/workspace/dashboard"];
protectedRoutes.forEach((route) =>
  expectEqual(isAnonymousAccessibleRoute(route), false, `protected route: ${route}`)
);

expectEqual(isOnboardingComplete(null), false, "missing profile is not complete");
expectEqual(
  isOnboardingComplete({ onboarding_completed: false }),
  false,
  "incomplete profile is not complete"
);
expectEqual(
  isOnboardingComplete({ onboarding_completed: true }),
  true,
  "complete profile is complete"
);

expectEqual(
  resolveOnboardingDestination(null, []),
  { kind: "login" },
  "missing profile goes to login"
);
expectEqual(
  resolveOnboardingDestination({ onboarding_completed: true }, ["alpha"]),
  { kind: "dashboard", href: "/alpha/dashboard" },
  "completed profile with workspace goes to dashboard"
);
expectEqual(
  resolveOnboardingDestination({ onboarding_completed: true }, []),
  { kind: "create-workspace" },
  "completed profile without workspace creates one"
);
expectEqual(
  resolveOnboardingDestination({ onboarding_completed: false }, ["alpha"]),
  { kind: "profile-onboarding" },
  "incomplete profile stays on profile onboarding"
);

expectEqual(
  resolvePostLoginContinueHref(null, ["alpha"]),
  "/onboarding",
  "missing profile continues to onboarding"
);
expectEqual(
  resolvePostLoginContinueHref({ onboarding_completed: false }, ["alpha"]),
  "/onboarding",
  "incomplete profile continues to onboarding"
);
expectEqual(
  resolvePostLoginContinueHref({ onboarding_completed: true }, ["alpha"]),
  "/alpha/dashboard",
  "completed profile continues to dashboard"
);
expectEqual(
  resolvePostLoginContinueHref({ onboarding_completed: true }, []),
  "/onboarding",
  "completed profile without workspace continues to onboarding"
);

expectEqual(
  resolveWorkspaceFallbackHref(["alpha"]),
  "/alpha/dashboard",
  "workspace fallback goes to dashboard"
);
expectEqual(
  resolveWorkspaceFallbackHref([]),
  "/onboarding",
  "workspace fallback goes to onboarding"
);

expectEqual(
  getPrimaryOrgDashboardHref(["alpha", "beta"]),
  "/alpha/dashboard",
  "first org wins"
);
expectEqual(getPrimaryOrgDashboardHref([]), null, "empty org list returns null");

console.log("flow journey coverage OK");
