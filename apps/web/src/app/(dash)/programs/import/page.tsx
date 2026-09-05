import Link from 'next/link';
import { ImportForm } from './ImportForm';

export const metadata = { title: 'Import a programme — Vela' };

export default function ImportProgramPage() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <Link href="/programs" className="text-sm ink-2 hover:underline">
        ← Programmes
      </Link>
      <header className="mt-3 mb-6">
        <h1 className="text-[30px] font-extrabold">Import a programme</h1>
        <p className="mt-0.5 text-sm ink-2">
          A block written in Excel or Numbers, brought in as a programme you can assign. The
          same shape is accepted as JSON at <code className="tnum">POST /api/programs/import</code>{' '}
          for anything that wants to push plans from elsewhere.
        </p>
      </header>
      <ImportForm />
    </div>
  );
}
