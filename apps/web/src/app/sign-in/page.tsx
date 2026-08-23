'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendMagicLink, verifyEmailOtp } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { VelaMark } from '@/components/VelaMark';

const field = 'w-full rounded-[14px] px-3.5 py-3 text-sm outline-none';
const fieldStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

/**
 * Coach sign in — code or link, whichever works.
 *
 * The email has carried a six-digit code since the magic-link template was customised, and
 * this screen offered nowhere to type it: the only way in was the link, so anyone reading
 * the mail on a phone had to open the portal there or forward it to themselves. The mobile
 * app has asked for the six digits all along. This is the portal catching up.
 *
 * Both paths stay live rather than one replacing the other. The link is fewer keystrokes in
 * the browser that asked for it; the code is the one that survives being read somewhere
 * else, and it is the only path that works when the link opens the wrong browser and loses
 * the PKCE verifier.
 */
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'sending' | 'code' | 'verifying'>('email');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStage('sending');
    setError(null);

    // shouldCreateUser: false — the portal must never mint an account for a mistyped
    // coach address. Coach accounts are provisioned deliberately.
    const { error: err } = await sendMagicLink(getBrowserSupabase(), email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`,
      shouldCreateUser: false,
    });

    if (err) {
      setError(err);
      // Move to the code step regardless. Failing the send strands anyone who already
      // holds a working code from a previous attempt if the field only appears on
      // success — the same trap the app's sign-in screen had.
      setSent(false);
      setStage('code');
      return;
    }

    setSent(true);
    setStage('code');
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setStage('verifying');
    setError(null);

    const { error: err } = await verifyEmailOtp(getBrowserSupabase(), email, code);
    if (err) {
      setError(err);
      setStage('code');
      return;
    }

    /**
     * The browser client writes the session to cookies, so the server can see it — but
     * only after a refresh. Without it the dashboard renders from the cache it built while
     * nobody was signed in, and bounces straight back here.
     */
    router.replace(nextPath());
    router.refresh();
  }

  const codeStage = stage === 'code' || stage === 'verifying';

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <VelaMark size={36} radius={16} />
          <span className="display-face text-lg font-bold">Vela</span>
        </div>

        <form
          onSubmit={codeStage ? verify : send}
          className="surface rounded-[20px] p-6"
          style={{ background: 'var(--surface)' }}
        >
          <h1 className="display-face text-xl font-bold">
            {codeStage ? 'Enter your code' : 'Coach sign in'}
          </h1>
          <p className="mt-1 mb-4 text-sm ink-2">
            {codeStage
              ? sent
                ? `We sent a six-digit code and a sign-in link to ${email}. Use whichever is easier — the link only works in this browser.`
                : `Enter the six-digit code for ${email}.`
              : "We'll email you a code and a link. No password needed."}
          </p>

          {codeStage ? (
            <>
              <label htmlFor="code" className="mb-1.5 block text-xs font-medium ink-2">
                Six-digit code
              </label>
              <input
                id="code"
                // `one-time-code` is what lets iOS and macOS offer the code from the
                // Mail notification, which is the whole point of asking for digits.
                autoComplete="one-time-code"
                inputMode="numeric"
                autoFocus
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className={`${field} tnum text-center text-lg tracking-[0.4em]`}
                style={fieldStyle}
              />
            </>
          ) : (
            <>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium ink-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@practice.com"
                className={field}
                style={fieldStyle}
              />
            </>
          )}

          {error && (
            <p className="mt-3 text-sm" style={{ color: palette.status.critical }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={
              stage === 'sending' ||
              stage === 'verifying' ||
              (codeStage ? code.length !== 6 : email.length === 0)
            }
            className="display-face mt-4 w-full rounded-full py-3.5 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: palette.brand[600] }}
          >
            {stage === 'sending'
              ? 'Sending…'
              : stage === 'verifying'
                ? 'Signing in…'
                : codeStage
                  ? 'Sign in'
                  : 'Email me a code'}
          </button>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            {codeStage ? (
              <button
                type="button"
                onClick={() => {
                  setStage('email');
                  setCode('');
                  setError(null);
                }}
                className="underline ink-2"
              >
                Use a different address
              </button>
            ) : (
              /* Someone who already has a code in their inbox should not have to trigger
                 another email — and a second send invalidates the code they are holding. */
              <button
                type="button"
                onClick={() => {
                  if (email.length === 0) {
                    setError('Enter your email address first, then your code.');
                    return;
                  }
                  setSent(false);
                  setError(null);
                  setStage('code');
                }}
                className="underline ink-2"
              >
                I already have a code
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Where to land after signing in.
 *
 * The middleware puts the path a coach was reaching for into `?next=`, and this screen used
 * to drop it — deep-link to a client's page, get bounced here, sign in, and arrive at the
 * roster instead. Read from `location` at call time rather than through `useSearchParams`,
 * which would drag this whole screen behind a Suspense boundary for one query parameter.
 *
 * Validated the same way the callback route validates it: a relative, same-origin path
 * only. An open redirect on a sign-in screen is how a phished link ends up handing
 * somebody else a session.
 */
function nextPath(): string {
  const raw = new URLSearchParams(window.location.search).get('next') ?? '/clients';
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/clients';
}
