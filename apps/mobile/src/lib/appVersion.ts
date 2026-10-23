import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { PORTAL_URL } from './integrations';

/** "0.3.10" vs "0.3.9" compared as numbers, part by part. */
export function isOlder(version: string, than: string): boolean {
  const a = version.split('.').map(Number);
  const b = than.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

/**
 * True when this build is older than the oldest one that shows everything a programme can
 * now carry. The portal says which that is; a build that cannot reach it says nothing,
 * because a false "please update" is worse than none.
 */
export function useUpdateNeeded(): boolean {
  const [needed, setNeeded] = useState(false);
  useEffect(() => {
    const mine = Constants.expoConfig?.version;
    if (!mine) return;
    let cancelled = false;
    fetch(`${PORTAL_URL}/api/app/min-version`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { minVersion?: string } | null) => {
        if (!cancelled && b?.minVersion) setNeeded(isOlder(mine, b.minVersion));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return needed;
}
