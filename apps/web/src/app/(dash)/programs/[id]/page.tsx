import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatusPill } from '@/components/ui';
import { loadAssignableClients, loadLibraryForPicker, loadProgram } from '../actions';
import { Builder } from './Builder';

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [program, library, clients] = await Promise.all([
    loadProgram(id),
    loadLibraryForPicker(),
    loadAssignableClients(),
  ]);

  if (!program) notFound();

  const totalItems = program.days.reduce((n, d) => n + d.items.length, 0);

  return (
    <div className="mx-auto max-w-6xl p-8">
      <Link href="/programs" className="text-sm ink-2 hover:underline">
        ← All programmes
      </Link>

      <header className="mt-3 mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-[30px] font-extrabold">{program.name}</h1>
          <p className="mt-0.5 text-sm ink-2">
            {program.durationWeeks} weeks · {program.days.length} days · {totalItems} exercises
            {program.description ? ` · ${program.description}` : ''}
          </p>
        </div>
        {program.isTemplate && <StatusPill tone="neutral">Template</StatusPill>}
      </header>

      <Builder program={program} library={library} clients={clients} />
    </div>
  );
}
