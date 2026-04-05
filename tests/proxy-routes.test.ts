import assert from "node:assert/strict";
import { isAnonymousAccessibleRoute } from "../lib/proxy-routes";

const publicRoutes = [
  "/",
  "/pricing",
  "/help",
  "/login",
  "/login/forgot-password",
  "/invite/abc123",
  "/auth/update-password",
];

for (const route of publicRoutes) {
  assert.equal(isAnonymousAccessibleRoute(route), true, route);
}

const protectedRoutes = [
  "/onboarding",
  "/invitations",
  "/abc",
  "/foo/bar",
  "/[orgSlug]/dashboard",
];

for (const route of protectedRoutes) {
  assert.equal(isAnonymousAccessibleRoute(route), false, route);
}

console.log("proxy route coverage OK");
