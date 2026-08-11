'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { palette } from '@vela/shared/tokens';
import { inviteClient } from './actions';

const field =
  'w-full rounded-[14px] px-3.5 py-3 text-sm outline-none';
const fieldStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

export function InviteForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const form = e.currentTarget;

    startTransition(async () => {
      const res = await inviteClient(formData);
      if (res.ok) {
        setResult({ ok: true, message: `Invitation sent to ${res.email}.` });
        form.reset();
        router.refresh();
      } else {
        setResult({ ok: false, message: res.error ?? 'Something went wrong.' });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="firstName" className="mb-1.5 block text-xs font-medium ink-2">
            First name
          </label>
          <input id="firstName" name="firstName" required className={field} style={fieldStyle} />
        </div>
        <div>
          <label htmlFor="lastName" className="mb-1.5 block text-xs font-medium ink-2">
            Last name
          </label>
          <input id="lastName" name="lastName" className={field} style={fieldStyle} />
        </div>
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs font-medium ink-2">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className={field}
          style={fieldStyle}
          placeholder="client@example.com"
        />
        <p className="mt-1.5 text-xs ink-3">
          They&apos;ll get a six-digit code by email. Entering it in Vela verifies
          their address, so only the person who controls this inbox can accept.
        </p>
      </div>

      <div>
        <label htmlFor="condition" className="mb-1.5 block text-xs font-medium ink-2">
          Presenting condition <span className="ink-3">(optional)</span>
        </label>
        <input
          id="condition"
          name="condition"
          className={field}
          style={fieldStyle}
          placeholder="ACL reconstruction — 14 weeks post-op"
        />
      </div>

      <div>
        <label htmlFor="goal" className="mb-1.5 block text-xs font-medium ink-2">
          Goal <span className="ink-3">(optional)</span>
        </label>
        <input
          id="goal"
          name="goal"
          className={field}
          style={fieldStyle}
          placeholder="Return to recreational football"
        />
      </div>

      {result && (
        <p
          className="text-sm"
          style={{ color: result.ok ? 'var(--success-text)' : palette.status.critical }}
        >
          {result.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="display-face w-full rounded-full py-3.5 text-sm font-semibold text-white disabled:opacity-40"
        style={{ background: palette.brand[600] }}
      >
        {pending ? 'Sending…' : 'Send invitation'}
      </button>
    </form>
  );
}
