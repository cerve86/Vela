import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Magic-link landing. Handles both shapes of email link:
 *
 *   ?code=…        PKCE. The browser that requested the link holds the verifier, so this
 *                  only works in that same browser — which is the common case.
 *   ?token_hash=…  Server-side verification. Needs no local verifier, so it also works
 *                  when the coach opens the link in a different browser or on a phone.
 *                  This is the shape to prefer in the email template.
 *
 * `next` is validated as a same-origin relative path before use — an open redirect on an
 * auth callback is how a phished link ends up handing a session to somebody else.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = (searchParams.get('type') ?? 'magiclink') as EmailOtpType;

  const rawNext = searchParams.get('next') ?? '/clients';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/clients';

  const supabase = await createServerSupabase();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/auth/error?reason=${encodeURIComponent(error.message)}`,
      );
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      return NextResponse.redirect(
        `${origin}/auth/error?reason=${encodeURIComponent(error.message)}`,
      );
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
}
