import Link from 'next/link';
import { listInvites } from '@coachapp/api';
import { Card, StatusPill } from '@/components/ui';
import { createServerSupabase } from '@/lib/supabase/server';
import { InviteForm } from './InviteForm';
import { RevokeButton } from './RevokeButton';

export const metadata = { title: 'Invite a client — CoachApp' };

function inviteState(i: {
  acceptedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
}): { tone: 'good' | 'warning' | 'critical' | 'neutral'; label: string } {
  if (i.acceptedAt) return { tone: 'good', label: 'Accepted' };
  if (i.revokedAt) return { tone: 'neutral', label: 'Revoked' };
  if (new Date(i.expiresAt) < new Date()) return { tone: 'critical', label: 'Expired' };
  return { tone: 'warning', label: 'Awaiting acceptance' };
}

export default async function InvitePage() {
  const supabase = await createServerSupabase();
  const invites = await listInvites(supabase);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <Link href="/clients" className="text-sm ink-2 hover:underline">
        ← All clients
      </Link>

      <header className="mt-3 mb-6">
        <h1 className="text-[30px] font-extrabold">Invite a client</h1>
        <p className="mt-0.5 text-sm ink-2">
          They&apos;ll appear on your roster as soon as they enter their code and verify their email.
        </p>
      </header>

      <Card className="mb-6">
        <InviteForm />
      </Card>

      <Card title="Invitations" action={<span className="text-xs ink-3">{invites.length} total</span>}>
        {invites.length === 0 ? (
          <p className="text-sm ink-2">No invitations yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs ink-3">
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Sent</th>
                <th className="pb-2 font-medium">Expires</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => {
                const state = inviteState(i);
                const live = !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date();
                return (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="py-2.5 font-medium">{i.email}</td>
                    <td className="tnum py-2.5 ink-2">
                      {new Date(i.createdAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </td>
                    <td className="tnum py-2.5 ink-2">
                      {new Date(i.expiresAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </td>
                    <td className="py-2.5">
                      <StatusPill tone={state.tone}>{state.label}</StatusPill>
                    </td>
                    <td className="py-2.5 text-right">
                      {live && <RevokeButton inviteId={i.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
