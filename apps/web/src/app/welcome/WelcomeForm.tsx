'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient, type EmailOtpType } from '@supabase/supabase-js';
import type { Database } from '@vela/api/types';
import { palette } from '@vela/shared/tokens';

type Stage = 'checking' | 'invalid' | 'set' | 'saving' | 'done';

const field = 'w-full rounded-[14px] px-3.5 py-2.5 text-sm outline-none';
const fieldStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

/**
 * The link's session, from either shape an auth email can carry:
 *
 *   ?token_hash=…&type=invite|recovery   verified here, works in any browser;
 *   #access_token=…&refresh_token=…       the auth server already verified it and sent
 *                                         the tokens along in the fragment.
 *
 * A plain client rather than the portal's cookie client: this page never needs the
 * coach dashboard's session, and must not overwrite one if a coach opens the link.
 */
export function WelcomeForm() {
  const supabase = useMemo(
    () =>
      createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            flowType: 'implicit',
            detectSessionInUrl: false,
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      ),
    [],
  );
  const [stage, setStage] = useState<Stage>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const tokenHash = params.get('token_hash');
      const type = (params.get('type') ?? hash.get('type') ?? 'invite') as EmailOtpType;

      let sessionEmail: string | null = null;
      if (tokenHash) {
        const { data, error: e } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (!e) sessionEmail = data.user?.email ?? null;
      } else if (hash.get('access_token') && hash.get('refresh_token')) {
        const { data, error: e } = await supabase.auth.setSession({
          access_token: hash.get('access_token')!,
          refresh_token: hash.get('refresh_token')!,
        });
        if (!e) sessionEmail = data.user?.email ?? null;
      }
      if (cancelled) return;
      if (!sessionEmail) {
        setStage('invalid');
        return;
      }
      // The tokens have done their job; keep them out of the address bar and history.
      window.history.replaceState(null, '', window.location.pathname);
      setEmail(sessionEmail);
      setStage('set');
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== again) return setError('The two passwords do not match.');
    setStage('saving');

    const { error: pwError } = await supabase.auth.updateUser({ password });
    if (pwError) {
      setError(pwError.message);
      setStage('set');
      return;
    }

    // If a practice invited her, this is the moment she joins it. Somebody who only reset
    // a password has no pending invitation, and that is not an error.
    const { error: acceptError } = await supabase.rpc('accept_my_invite');
    setJoined(acceptError ? (acceptError.code === 'P0002' ? false : null) : true);
    if (acceptError && acceptError.code !== 'P0002') {
      setError(`Your password is saved, but joining the practice failed: ${acceptError.message}`);
    }
    await supabase.auth.signOut();
    setStage('done');
  }

  if (stage === 'checking') {
    return (
      <div
        className="surface rounded-[20px] p-6 text-sm ink-2"
        style={{ background: 'var(--surface)' }}
      >
        Checking your link…
      </div>
    );
  }

  if (stage === 'invalid') {
    return (
      <div className="surface rounded-[20px] p-6" style={{ background: 'var(--surface)' }}>
        <h1 className="display-face text-xl font-bold">This link has expired</h1>
        <p className="mt-2 text-sm ink-2">
          Invitation links work once and for a limited time. Ask your physiotherapist to send a new
          one, or use “Forgot your password?” in the app for a fresh link.
        </p>
      </div>
    );
  }

  if (stage === 'done') {
    return (
      <div className="surface rounded-[20px] p-6" style={{ background: 'var(--surface)' }}>
        <h1 className="display-face text-xl font-bold">
          {joined ? 'You’re in' : 'Password saved'}
        </h1>
        <p className="mt-2 text-sm ink-2">
          {joined ? 'Your physiotherapist’s programme is waiting for you. ' : ''}
          Open the Vela app on your phone and sign in with{' '}
          <span className="font-medium ink-1">{email}</span> and the password you just chose.
        </p>
        {error && (
          <p className="mt-3 text-sm" style={{ color: palette.status.critical }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={save}
      className="surface rounded-[20px] p-6"
      style={{ background: 'var(--surface)' }}
    >
      <h1 className="display-face text-xl font-bold">Welcome to Vela</h1>
      <p className="mt-1 mb-4 text-sm ink-2">
        Choose a password for <span className="font-medium ink-1">{email}</span>. It is the one you
        will use in the app.
      </p>

      <label htmlFor="password" className="mb-1.5 block text-xs font-medium ink-2">
        Password
      </label>
      <input
        id="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={field}
        style={fieldStyle}
      />

      <label htmlFor="again" className="mt-3 mb-1.5 block text-xs font-medium ink-2">
        Once more
      </label>
      <input
        id="again"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={again}
        onChange={(e) => setAgain(e.target.value)}
        className={field}
        style={fieldStyle}
      />

      {error && (
        <p className="mt-3 text-sm" style={{ color: palette.status.critical }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={stage === 'saving'}
        className="display-face mt-5 w-full rounded-full px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
        style={{ background: palette.brand[600] }}
      >
        {stage === 'saving' ? 'Saving…' : 'Save and continue'}
      </button>
      <p className="mt-3 text-center text-xs ink-3">At least 8 characters. No codes, ever again.</p>
    </form>
  );
}
