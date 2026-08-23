import Link from 'next/link';
import { CHALLENGE_METRICS, challengeWeekNow } from '@vela/api';
import { Card, EmptyState } from '@/components/ui';
import { loadChallenges } from './actions';
import { NewChallengeForm } from './NewChallengeForm';
import { loadAssignableClients } from '../programs/actions';

export const metadata = { title: 'Challenges — Vela' };

export default async function ChallengesPage() {
  const [challenges, clients] = await Promise.all([loadChallenges(), loadAssignableClients()]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6">
        <h1 className="text-[30px] font-extrabold">Challenges</h1>
        {/*
          The framing is the feature. A group total is something a cohort of postpartum women
          can be part of without being measured against each other, and it is the only shape
          of this idea worth shipping to them.
        */}
        <p className="mt-0.5 text-sm ink-2">
          Challenges run across clients, not against them. Everyone sees the group total and
          their own share — never anybody else&apos;s name, and never pain, weight or load.
        </p>
      </header>

      <div className="mb-6">
        <NewChallengeForm clients={clients} />
      </div>

      {challenges.length === 0 ? (
        <EmptyState
          art="roster"
          title="No challenges yet"
          body="Pick two or more clients above. A good first one is four sessions a week for four weeks — enough to build a habit, short enough to finish."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {challenges.map((c) => {
            const metric = CHALLENGE_METRICS.find((m) => m.value === c.metric);
            const week = challengeWeekNow(c.startsOn, c.weeks, today);

            return (
              <Link key={c.id} href={`/challenges/${c.id}`} className="block">
                <Card>
                  <div className="flex items-center gap-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span className="display-face text-[17px] font-semibold">{c.name}</span>
                        <span
                          className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                          style={{ background: 'var(--tint-mint)', color: 'var(--ok)' }}
                        >
                          {week === null
                            ? `Starts ${c.startsOn}`
                            : `Week ${week} of ${c.weeks}`}
                        </span>
                      </div>
                      {c.summary && <p className="mt-1 text-sm ink-2">{c.summary}</p>}
                      <p className="mt-1.5 text-xs ink-3">
                        {metric?.label ?? c.metric} · {c.participants}{' '}
                        {c.participants === 1 ? 'participant' : 'participants'} ·{' '}
                        {c.weeklyTarget} a week each
                      </p>
                    </div>
                    <span className="text-sm ink-2">→</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
