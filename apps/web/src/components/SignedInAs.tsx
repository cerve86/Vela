'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSessionUser, signOut, type SessionUser } from '@coachapp/api';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export function SignedInAs() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    getSessionUser(getBrowserSupabase()).then(setUser);
  }, []);

  if (!user) return null;

  const name = `${user.firstName} ${user.lastName}`.trim() || user.email;

  return (
    <div>
      <div className="px-2 text-sm font-medium">{name}</div>
      <div className="px-2 text-xs ink-3">{user.email}</div>
      <button
        type="button"
        onClick={async () => {
          await signOut(getBrowserSupabase());
          router.push('/sign-in');
        }}
        className="mt-2 px-2 text-xs underline ink-2"
      >
        Sign out
      </button>
    </div>
  );
}
