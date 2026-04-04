import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Region assumptions (latency for India / Tamil Nadu):
 * - Provision the Supabase project in **ap-south-1 (Mumbai)** so DB + Auth API stay in-region.
 * - Run Next.js/Vercel in **Mumbai (bom1)** or as close as possible to ap-south-1 so each SSR
 *   request does not add a transoceanic hop before hitting Supabase.
 * - Avoid splitting “app in US-East + DB in Mumbai”: that doubles cross-region RTT on every RPC.
 */
let warnedNonPreferredSupabaseHost = false;

function warnIfSupabaseHostLooksMisplaced(supabaseUrl: string) {
  if (process.env.NODE_ENV !== "development" || warnedNonPreferredSupabaseHost) return;
  try {
    const host = new URL(supabaseUrl).hostname.toLowerCase();
    // Custom domains or non-standard hosts won’t match; this is a best-effort hint only.
    if (
      host.includes("us-east") ||
      host.includes("eu-west") ||
      host.includes("ap-northeast")
    ) {
      warnedNonPreferredSupabaseHost = true;
      console.warn(
        "[flowcore] NEXT_PUBLIC_SUPABASE_URL hostname suggests a non–India-primary region. " +
          "For Tamil Nadu users, use a Mumbai (ap-south-1) Supabase project and colocate app compute."
      );
    }
  } catch {
    /* ignore invalid URL */
  }
}

/**
 * Server / Server Action Supabase client — reads session from Next.js cookies.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  warnIfSupabaseHostLooksMisplaced(url);

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component — ignore if middleware already refreshed session
        }
      },
    },
  });
}
