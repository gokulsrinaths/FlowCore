const PUBLIC_EXACT_ROUTES = new Set(["/", "/pricing", "/help", "/auth/update-password"]);
const PUBLIC_PREFIX_ROUTES = ["/login", "/invite"];

export function isAnonymousAccessibleRoute(path: string): boolean {
  if (PUBLIC_EXACT_ROUTES.has(path)) {
    return true;
  }

  return PUBLIC_PREFIX_ROUTES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}
