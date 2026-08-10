import { exercises } from '@coachapp/shared';
import { Card, StatusPill } from '@/components/ui';

export const metadata = { title: 'Exercise library — CoachApp' };

export default function LibraryPage() {
  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Exercise library</h1>
        <p className="mt-0.5 text-sm ink-2">
          {exercises.length} exercises · video upload and custom exercises arrive in Phase 2
        </p>
      </header>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs ink-3">
              <th className="pb-2 font-medium">Exercise</th>
              <th className="pb-2 font-medium">Muscle groups</th>
              <th className="pb-2 font-medium">Equipment</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Video</th>
            </tr>
          </thead>
          <tbody>
            {exercises.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="py-2.5">
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs ink-3">{e.cues[0]}</div>
                </td>
                <td className="py-2.5 ink-2">{e.muscleGroups.join(', ').replace(/_/g, ' ')}</td>
                <td className="py-2.5 ink-2">{e.equipment}</td>
                <td className="py-2.5">
                  {e.isRehab ? (
                    <StatusPill tone="good">Rehab</StatusPill>
                  ) : (
                    <StatusPill tone="neutral">Strength</StatusPill>
                  )}
                </td>
                <td className="py-2.5 ink-3">{e.videoPath ? 'Uploaded' : 'Not uploaded'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
