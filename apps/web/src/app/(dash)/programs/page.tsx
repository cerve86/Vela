import Link from 'next/link';
import { Card, EmptyState, StatusPill } from '@/components/ui';
import { loadPrograms } from './actions';
import { NewProgramForm } from './NewProgramForm';

export const metadata = { title: 'Programmes — Vela' };

export default async function ProgramsPage() {
  const programs = await loadPrograms();

  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6">
        <h1 className="text-[30px] font-extrabold">Programmes</h1>
        <p className="mt-0.5 text-sm ink-2">
          Build a block once, assign it with a start date, and Vela puts the sessions on
          the right days.
        </p>
      </header>

      <div className="mb-6">
        <NewProgramForm />
      </div>

      {programs.length === 0 ? (
        <EmptyState
          title="No programmes yet"
          body="Create your first block above — for example a 6-week early postnatal progression, or a 12-week return to running."
        />
      ) : (
        <Card title="All programmes">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs ink-3">
                <th className="pb-2 font-medium">Programme</th>
                <th className="pb-2 font-medium">Weeks</th>
                <th className="pb-2 font-medium">Days</th>
                <th className="pb-2 font-medium">Exercises</th>
                <th className="pb-2 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2.5">
                    <Link href={`/programs/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    {p.description && <div className="text-xs ink-3">{p.description}</div>}
                  </td>
                  <td className="tnum py-2.5 ink-2">{p.durationWeeks}</td>
                  <td className="tnum py-2.5 ink-2">{p.dayCount}</td>
                  <td className="tnum py-2.5 ink-2">{p.itemCount}</td>
                  <td className="py-2.5">
                    {p.isTemplate ? (
                      <StatusPill tone="neutral">Template</StatusPill>
                    ) : (
                      <StatusPill tone="good">Programme</StatusPill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
