/**
 * The mascot's cheer, as an event.
 *
 * Screens that log something call `celebrate(kind)`; the mascot on Today listens and
 * cheers in the pose the moment deserves — an apple for a meal, arms up for the rest.
 * Today is usually not mounted at that moment, so the last cheer is remembered and the
 * mascot cheers on its next appearance if it happened a moment ago. A cheer is a moment,
 * not a state: nothing here persists past the process.
 */
export type CheerKind = 'food' | 'session' | 'read' | 'strava';

type Listener = (kind: CheerKind) => void;

const listeners = new Set<Listener>();
let lastAt = 0;
let lastKind: CheerKind = 'session';

export function celebrate(kind: CheerKind = 'session'): void {
  lastAt = Date.now();
  lastKind = kind;
  listeners.forEach((l) => l(kind));
}

/** The kind of thing that happened in the last few seconds, or null. */
export function recentCelebration(withinMs = 8_000): CheerKind | null {
  return Date.now() - lastAt < withinMs ? lastKind : null;
}

export function onCelebrate(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
