"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client — use only in Client Components / hooks.
 * Session is stored in cookies managed by @supabase/ssr.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createBrowserClient(url, key);
}
