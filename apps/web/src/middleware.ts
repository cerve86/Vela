import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Paths that must resolve with no session.
 *
 * `/privacy` is on this list because App Store Connect requires a reachable privacy
 * policy and a reviewer arrives without an account — gating it would fail review while
 * looking, from the inside, like the page worked fine.
 */
const PUBLIC_PATHS = ['/sign-in', '/auth/callback', '/auth/error', '/privacy', '/api/'];
// `/api/` is here because route handlers authenticate themselves and answer 401 as JSON.
// A script posting a programme with a Bearer token has no cookie, and redirecting it to
// an HTML sign-in page is the wrong answer to a machine.

/**
 * Refreshes the auth cookie on every request and gates the dashboard.
 *
 * This is a convenience redirect, not the security boundary — row level security is.
 * If this middleware were removed entirely, an unauthenticated visitor would still see
 * an empty portal rather than someone else's clients.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  // Middleware runs on every route, so throwing here takes the whole site down — the
  // privacy policy and the sign-in screen included. A deployment missing its environment
  // is a configuration problem, not a reason to serve 500 to everybody: log it once per
  // request and let the request through, so public pages still work and the protected
  // ones fail somewhere that names the cause.
  if (!url || !anonKey) {
    console.error(
      '[vela] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — ' +
        'auth is disabled for this request. Set both in the deployment environment.',
    );
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/sign-in';
    redirect.searchParams.set('next', path);
    return NextResponse.redirect(redirect);
  }

  if (user && path === '/sign-in') {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/clients';
    redirect.search = '';
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
