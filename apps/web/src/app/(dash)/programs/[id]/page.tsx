import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatusPill } from '@/components/ui';
import {
  loadAssignableClients,
  loadAssignmentsFor,
  loadLibraryForPicker,
  loadProgram,
} from '../actions';
import { Builder } from './Builder';
import { DescriptiveProgram } from './DescriptiveProgram';
import { DeleteProgramButton } from '../DeleteProgramButton';

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [program, library, clients, assignments] = await Promise.all([
    loadProgram(id),
    loadLibraryForPicker(),
    loadAssignableClients(),
    loadAssignmentsFor(id),
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
            {program.kind === 'descriptive'
              ? `${program.durationWeeks} weeks · written programme`
              : `${program.durationWeeks} weeks · ${program.days.length} days · ${totalItems} exercises`}
            {program.description ? ` · ${program.description}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {program.isTemplate && <StatusPill tone="neutral">Template</StatusPill>}
          <DeleteProgramButton id={program.id} name={program.name} afterDelete="list" />
        </div>
      </header>

      {program.kind === 'descriptive' ? (
        <DescriptiveProgram program={program} clients={clients} assignments={assignments} />
      ) : (
        <Builder program={program} library={library} clients={clients} assignments={assignments} />
      )}
    </div>
  );
}
