import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Public routes: marketing, auth, static.
 * Authenticated: onboarding, invite, /[orgSlug]/...
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Avoid a Supabase round-trip on static marketing — major win for TTFB / cold regions (e.g. India → EU/US API).
  const isPublicMarketing =
    path === "/" || path === "/pricing" || path === "/help";
  if (isPublicMarketing) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLogin = path === "/login" || path.startsWith("/login/");

  if (!user && !isLogin && !isPublicMarketing) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Keep /login reachable when signed in so "Sign in" always shows the auth page
  // (continue / sign out). Session cookies are refreshed via getUser() above.

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
