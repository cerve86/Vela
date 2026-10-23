/**
 * Matching exercise names to the library — pure, so it is tested without a database.
 */

/** Library names as a coach types them, made comparable: case, spacing and hyphens aside. */
export function normaliseExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-–—_/]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The name without a bracketed equipment note: "Split Squat (Dumbbell)" → "Split Squat". */
export function stripBrackets(name: string): string {
  return name.replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ').trim();
}

/**
 * Matches names to library ids, pure. Exact first (case, spacing, hyphens aside); then
 * the name with any bracketed note removed, on either side — "Split Squat (Dumbbell)"
 * finds "Split Squat", and "Split Squat" finds a library "Split Squat (Dumbbell)" when it
 * is the only one. Two candidates for the same bare name is ambiguity, and ambiguity is
 * refused: guessing which split squat was meant is how the wrong one gets prescribed.
 */
export function matchExerciseNames(
  library: { id: string; name: string; isMine: boolean }[],
  names: string[],
): { byName: Map<string, string>; unmatched: string[] } {
  const exact = new Map<string, string>();
  const bare = new Map<string, Set<string>>();
  for (const e of library) {
    const key = normaliseExerciseName(e.name);
    // A coach's own exercise shadows a shipped one of the same name: she made it on purpose.
    if (!exact.has(key) || e.isMine) exact.set(key, e.id);
    const b = normaliseExerciseName(stripBrackets(e.name));
    if (!bare.has(b)) bare.set(b, new Set());
    bare.get(b)!.add(e.id);
  }

  const byName = new Map<string, string>();
  const unmatched: string[] = [];
  for (const raw of names) {
    const key = normaliseExerciseName(raw);
    const bareKey = normaliseExerciseName(stripBrackets(raw));
    const candidates = bare.get(bareKey);
    const id =
      exact.get(key) ??
      exact.get(bareKey) ??
      (candidates && candidates.size === 1 ? [...candidates][0] : undefined);
    if (id) byName.set(key, id);
    else if (!unmatched.some((u) => normaliseExerciseName(u) === key)) unmatched.push(raw);
  }
  return { byName, unmatched };
}
