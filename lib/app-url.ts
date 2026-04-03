/**
 * Server-only base URL for in-app links (invites, cron, notifications).
 */
export function getAppBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const base = raw.replace(/\/$/, "");
  return base || "http://localhost:3000";
}

export function buildInviteUrl(token: string): string {
  const base = getAppBaseUrl().replace(/\/$/, "");
  const t = encodeURIComponent(token.trim());
  return `${base}/invite/${t}`;
}
