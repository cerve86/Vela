'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FuelSettings } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { Card } from '@/components/ui';
import { saveFuelSettingsAction } from './actions';

/**
 * How fuelling reaches her. A restrictive-pattern flag takes every amount off her cards
 * and keeps the calorie diary hidden whatever else is set. Calorie tracking is off unless
 * you turn it on; switching it off hides the diary, scanner and calorie ring and deletes
 * nothing — the export has all of it.
 */
export function FuelSettingsCard({
  clientId,
  settings,
}: {
  clientId: string;
  settings: FuelSettings;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const save = (next: FuelSettings) =>
    startTransition(async () => {
      setError(null);
      const res = await saveFuelSettingsAction(clientId, next);
      if (!res.ok) setError(res.error ?? 'Could not save.');
      else router.refresh();
    });
  return (
    <Card title="Fuelling">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          disabled={pending}
          checked={settings.restrictivePattern}
          onChange={(e) => save({ ...settings, restrictivePattern: e.target.checked })}
          className="mt-1"
          style={{ accentColor: palette.brand[600] }}
        />
        <span>
          Restrictive patterns.
          <span className="ink-3"> No amounts on her cards, and no calorie diary.</span>
        </span>
      </label>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          disabled={pending || settings.restrictivePattern}
          checked={settings.calorieTracking && !settings.restrictivePattern}
          onChange={(e) => save({ ...settings, calorieTracking: e.target.checked })}
          className="mt-1"
          style={{ accentColor: palette.brand[600] }}
        />
        <span>
          Calorie tracking.
          <span className="ink-3">
            {' '}
            The food diary, scanner and calorie ring. Off, she sees Fuel for today instead; nothing
            she logged is deleted.
          </span>
        </span>
      </label>
      <a
        href={`/api/clients/${clientId}/food-log.csv`}
        className="mt-3 inline-block text-xs underline ink-2"
      >
        Download her food log (CSV)
      </a>
      {error && (
        <p className="mt-2 text-xs" style={{ color: palette.status.critical }}>
          {error}
        </p>
      )}
    </Card>
  );
}
