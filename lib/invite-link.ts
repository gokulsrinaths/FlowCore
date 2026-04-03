/** Client-safe invite URL (uses public app URL or current origin). */
export function publicInviteUrl(token: string): string {
  const t = token.trim();
  const base =
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")) ||
    (typeof window !== "undefined" ? window.location.origin : "") ||
    "";
  return `${base}/invite/${encodeURIComponent(t)}`;
}
