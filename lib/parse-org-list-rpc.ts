/**
 * Parse jsonb from flowcore_list_user_organizations (Edge-safe, no React).
 */
export function parseOrgListRpc(data: unknown): { slug: string; id: string }[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return (data as { slug?: string; id?: string }[])
      .filter((o) => typeof o.slug === "string" && o.slug.length > 0)
      .map((o) => ({ slug: o.slug as string, id: String(o.id ?? "") }));
  }
  if (typeof data === "string") {
    try {
      const p = JSON.parse(data);
      return Array.isArray(p)
        ? (p as { slug?: string; id?: string }[])
            .filter((o) => typeof o.slug === "string" && o.slug.length > 0)
            .map((o) => ({ slug: o.slug as string, id: String(o.id ?? "") }))
        : [];
    } catch {
      return [];
    }
  }
  return [];
}
