'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { revokeInviteAction } from './actions';

export function RevokeButton({ inviteId }: { inviteId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await revokeInviteAction(inviteId);
          router.refresh();
        })
      }
      className="text-xs underline ink-2 disabled:opacity-40"
    >
      {pending ? 'Revoking…' : 'Revoke'}
    </button>
  );
}
