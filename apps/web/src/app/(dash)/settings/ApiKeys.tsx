'use client';

import { useState, useTransition } from 'react';
import type { ApiKey } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { StatusPill } from '@/components/ui';
import { createApiKeyAction, revokeApiKeyAction } from './actions';

const field = 'rounded-[14px] px-3.5 py-2.5 text-sm outline-none';
const fieldStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

function when(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ApiKeys({ keys }: { keys: ApiKey[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-5">
      {fresh && (
        <div className="rounded-[14px] p-4" style={{ background: palette.brand[50] }}>
          <div className="text-sm font-semibold" style={{ color: palette.brand[800] }}>
            Your new key, “{fresh.name}”
          </div>
          <p className="mt-1 text-sm ink-2">
            Copy it now. It is shown this once and cannot be recovered — if you lose it, revoke it
            and make another.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code
              className="flex-1 overflow-x-auto rounded-[10px] px-3 py-2 text-sm"
              style={{ background: 'var(--surface)' }}
            >
              {fresh.key}
            </code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(fresh.key);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
              className="display-face rounded-full px-4 py-2 text-sm font-semibold text-white"
              style={{ background: palette.brand[600] }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setFresh(null);
              setCopied(false);
            }}
            className="mt-3 text-xs underline ink-2"
          >
            I have saved it
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const name = String(fd.get('name') ?? '').trim();
          setError(null);
          startTransition(async () => {
            const res = await createApiKeyAction(fd);
            if (!res.ok || !res.key) setError(res.error ?? 'Something went wrong.');
            else {
              setFresh({ name, key: res.key });
              setCopied(false);
              form.reset();
            }
          });
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-64 flex-1">
          <label htmlFor="key-name" className="mb-1.5 block text-xs font-medium ink-2">
            What will use it?
          </label>
          <input
            id="key-name"
            name="name"
            required
            maxLength={60}
            placeholder="Claude on my laptop"
            className={`${field} w-full`}
            style={fieldStyle}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="display-face rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: palette.brand[600] }}
        >
          {pending ? 'Creating…' : 'Create key'}
        </button>
      </form>

      {error && (
        <p className="text-sm" style={{ color: palette.status.critical }}>
          {error}
        </p>
      )}

      {keys.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs ink-3">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Key</th>
              <th className="pb-2 font-medium">Created</th>
              <th className="pb-2 font-medium">Last used</th>
              <th className="pb-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-b last:border-0">
                <td className="py-2.5 font-medium">{k.name}</td>
                <td className="py-2.5">
                  <code className="text-xs ink-2">{k.prefix}…</code>
                </td>
                <td className="py-2.5 ink-2">{when(k.createdAt)}</td>
                <td className="py-2.5 ink-2">{when(k.lastUsedAt)}</td>
                <td className="py-2.5 text-right">
                  {k.revokedAt ? (
                    <StatusPill tone="neutral">Revoked</StatusPill>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Revoke “${k.name}”? Anything using it stops working immediately.`,
                          )
                        )
                          return;
                        setError(null);
                        startTransition(async () => {
                          const res = await revokeApiKeyAction(k.id);
                          if (!res.ok) setError(res.error ?? 'Could not revoke the key.');
                        });
                      }}
                      className="text-xs underline ink-2 disabled:opacity-40"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
