import { LibraryClient } from './LibraryClient';
import { loadLibrary } from './actions';
import { loadAssignableClients } from '../programs/actions';

export const metadata = { title: 'Exercise library — Vela' };

export default async function LibraryPage() {
  const [exercises, clients] = await Promise.all([loadLibrary({}), loadAssignableClients()]);
  const mine = exercises.filter((e) => e.isMine).length;

  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6">
        <h1 className="text-[30px] font-extrabold">Exercise library</h1>
        <p className="mt-0.5 text-sm ink-2">
          {exercises.length} exercises · {mine} of them yours. Tick a few and bundle them into
          a block — that is the quickest way onto a client&apos;s phone. Vela&apos;s own
          exercises are read-only; duplicate one to make it yours.
        </p>
      </header>

      <LibraryClient exercises={exercises} clients={clients} />
    </div>
  );
}
