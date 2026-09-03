import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncHealth } from './health';
import { useSession } from './session';

/**
 * Keeping Apple Health current without anybody asking.
 *
 * `syncHealth` was only ever reachable from two places: once during the welcome flow, and
 * from the Apple Health screen behind a deliberate tap. But Today's two headline figures —
 * recovery and strain — are computed from *today's* sleep, HRV and active-energy rows, so
 * on any ordinary morning the app opened to "—" and "Estimated · no sleep recorded last
 * night" on a night that had synced to Apple Health perfectly well. The number looked
 * broken, and the fix was a settings screen nobody had a reason to visit.
 *
 * So the sync runs on cold start and whenever the app returns to the foreground, which is
 * exactly when a stale dial would otherwise be looked at.
 *
 * This is not Apple's background delivery, and does not pretend to be: nothing runs while
 * the app is closed. It removes the manual step, which is the part that was breaking the
 * screen. Background delivery stays worth doing — it is the only way an overnight backfill
 * reaches the coach before she opens the app.
 */

/** Minimum gap between automatic syncs, so tab-switching does not hammer HealthKit. */
const MIN_INTERVAL_MS = 30 * 60 * 1000;

const LAST_SYNC_KEY = 'vela.health.lastAutoSync';

/**
 * Screens that want to redraw once new readings land.
 *
 * A foreground event is not a navigation event, so `useFocusEffect` does not fire for it
 * and a hook that refetches on focus would go on showing what it fetched before the phone
 * went in a pocket. This is the smallest thing that closes that gap — one module-level
 * signal, rather than pulling in a query cache for a single edge.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeHealthSync(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify() {
  for (const fn of listeners) fn();
}

/**
 * Runs the sync at most once per `MIN_INTERVAL_MS`, and tells the screens when rows landed.
 *
 * Errors are swallowed on purpose. This is a background convenience: a client who has not
 * granted HealthKit, or is on a device without it, must not meet an error banner she did
 * not ask for. The Apple Health screen is where a failure is worth reporting, because
 * there somebody asked.
 */
async function syncIfDue(force = false): Promise<void> {
  try {
    if (!force) {
      const last = await AsyncStorage.getItem(LAST_SYNC_KEY);
      const at = last ? Number(last) : 0;
      if (Number.isFinite(at) && Date.now() - at < MIN_INTERVAL_MS) return;
    }

    // Stamped before the run, not after. A sync that throws or hangs should still hold the
    // interval open — otherwise every foreground retries a failure that is not going to
    // fix itself in thirty seconds.
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));

    const { written } = await syncHealth(30);
    if (written > 0) notify();
  } catch {
    // See above.
  }
}

/**
 * Mount once, inside the authenticated part of the tree.
 *
 * Gated on a client row and health consent: reading Apple Health for somebody who has not
 * accepted an invitation, or has not given Article 9 consent, is exactly the thing the
 * consent gate exists to prevent — and a HealthKit query fired before consent is recorded
 * would be indefensible whatever the permission sheet said.
 */
export function useHealthAutoSync(): void {
  const { client, hasConsent } = useSession();
  const armed = Boolean(client) && hasConsent;
  const wasActive = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!armed) return;

    void syncIfDue();

    const sub = AppState.addEventListener('change', (next) => {
      const returning = wasActive.current.match(/inactive|background/) && next === 'active';
      wasActive.current = next;
      if (returning) void syncIfDue();
    });

    return () => sub.remove();
  }, [armed]);
}

/** Forces a sync regardless of the interval — for pull-to-refresh, which is an explicit ask. */
export async function syncHealthNow(): Promise<void> {
  await syncIfDue(true);
}
