import Link from 'next/link';
import { Card, EmptyState, StatusPill } from '@/components/ui';
import { loadArchivedPrograms, loadPrograms } from './actions';
import { NewProgramForm } from './NewProgramForm';
import { DeleteProgramButton } from './DeleteProgramButton';
import { RestoreProgramButton } from './RestoreProgramButton';

export const metadata = { title: 'Programmes — Vela' };

export default async function ProgramsPage() {
  const [programs, archived] = await Promise.all([loadPrograms(), loadArchivedPrograms()]);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-8">
      <header className="mb-6">
        <h1 className="text-[30px] font-extrabold">Programmes</h1>
        <p className="mt-0.5 text-sm ink-2">
          Build a block once, assign it with a start date, and Vela puts the sessions on the right
          days.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <NewProgramForm />
        <Link href="/programs/import" className="text-sm font-medium ink-2 hover:underline">
          Import from a spreadsheet →
        </Link>
      </div>

      {programs.length === 0 ? (
        <EmptyState
          art="roster"
          title="No programmes yet"
          body="Create your first block above — for example a 6-week early postnatal progression, or a 12-week return to running."
        />
      ) : (
        <Card title="All programmes">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs ink-3">
                  <th className="pb-2 font-medium">Programme</th>
                  <th className="pb-2 font-medium">Weeks</th>
                  <th className="pb-2 font-medium">Days</th>
                  <th className="pb-2 font-medium">Exercises</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2" />
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
                    <td className="tnum py-2.5 ink-2">
                      {p.kind === 'descriptive' ? '—' : p.dayCount}
                    </td>
                    <td className="tnum py-2.5 ink-2">
                      {p.kind === 'descriptive' ? '—' : p.itemCount}
                    </td>
                    <td className="py-2.5">
                      {p.kind === 'descriptive' ? (
                        <StatusPill tone="warning">Written</StatusPill>
                      ) : p.isTemplate ? (
                        <StatusPill tone="neutral">Template</StatusPill>
                      ) : (
                        <StatusPill tone="good">Programme</StatusPill>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <DeleteProgramButton id={p.id} name={p.name} afterDelete="refresh" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm ink-2">Archived ({archived.length})</summary>
          <ul className="mt-2 divide-y text-sm">
            {archived.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-medium">{p.name}</span>
                  <span className="ink-3">
                    {' '}
                    · {p.kind === 'descriptive' ? 'written' : 'programme'} · archived{' '}
                    {p.archivedAt.slice(0, 10)}
                  </span>
                </span>
                <RestoreProgramButton id={p.id} name={p.name} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
