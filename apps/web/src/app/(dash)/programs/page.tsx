import { EmptyState } from '@/components/ui';

export const metadata = { title: 'Programs — Vela' };

export default function ProgramsPage() {
  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Programs</h1>
        <p className="mt-0.5 text-sm ink-2">Build, template and assign training blocks</p>
      </header>
      <EmptyState
        title="Program builder — Phase 2"
        body="Weeks and days, supersets, prescribed sets, reps, tempo and rest, saved as reusable templates and assigned to a client with a start date. Checkpoint CP2 is a real 4-week rehab program appearing on the right days in the iOS app."
      />
    </div>
  );
}
