'use client';

import { useState } from 'react';
import { sendMagicLink } from '@coachapp/api';
import { palette } from '@coachapp/shared/tokens';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError(null);

    // shouldCreateUser: false — the portal must never mint an account for a mistyped
    // coach address. Coach accounts are provisioned deliberately.
    const { error: err } = await sendMagicLink(getBrowserSupabase(), email, {
      redirectTo: `${window.location.origin}/auth/callback`,
      shouldCreateUser: false,
    });

    if (err) {
      setError(err);
      setState('error');
    } else {
      setState('sent');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white"
            style={{ background: palette.brand[600] }}
            aria-hidden
          >
            C
          </span>
          <span className="display-face text-lg font-bold">CoachApp</span>
        </div>

        {state === 'sent' ? (
          <div className="surface rounded-[20px] p-6" style={{ background: 'var(--surface)' }}>
            <h1 className="display-face text-xl font-bold">Check your email</h1>
            <p className="mt-2 text-sm ink-2">
              We sent a sign-in link to <strong>{email}</strong>. Opening it signs you in — there
              is no password to remember.
            </p>
            <button
              onClick={() => setState('idle')}
              className="mt-4 text-sm underline ink-2"
              type="button"
            >
              Use a different address
            </button>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="surface rounded-[20px] p-6"
            style={{ background: 'var(--surface)' }}
          >
            <h1 className="display-face text-xl font-bold">Coach sign in</h1>
            <p className="mt-1 mb-4 text-sm ink-2">
              We&apos;ll email you a link. No password needed.
            </p>

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
              className="w-full rounded-[14px] px-3.5 py-3 text-sm outline-none"
              style={{ background: 'var(--ghost)', color: 'var(--ink-primary)' }}
            />

            {error && (
              <p className="mt-3 text-sm" style={{ color: palette.status.critical }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={state === 'sending' || email.length === 0}
              className="display-face mt-4 w-full rounded-full py-3.5 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: palette.brand[600] }}
            >
              {state === 'sending' ? 'Sending…' : 'Email me a link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
