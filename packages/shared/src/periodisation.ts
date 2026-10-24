/**
 * Periodisation as the coach's build spec describes it: four phases, blocks of four weeks
 * with a conditional deload, and the power and elasticity ladder. The words are hers.
 */

export type Phase = 'base' | 'build' | 'peak' | 'taper';

export const PHASES: { value: Phase; label: string; emphasis: string }[] = [
  {
    value: 'base',
    label: 'Base',
    emphasis: 'Weakness-led strength, stability, isometrics and mobility.',
  },
  { value: 'build', label: 'Build', emphasis: 'Adds power and plyometrics, race-specific.' },
  {
    value: 'peak',
    label: 'Peak',
    emphasis: 'Power expression; strength to maintenance to protect the run.',
  },
  { value: 'taper', label: 'Taper', emphasis: 'Heavy isometrics held, the rest light.' },
];

export const POWER_LEVELS: { level: 1 | 2 | 3 | 4; name: string; work: string }[] = [
  { level: 1, name: 'L1', work: 'Depth and stick landings — the gate.' },
  { level: 2, name: 'L2', work: 'Countermovement jumps and pogos.' },
  { level: 3, name: 'L3', work: 'Bounding and single-leg work.' },
  { level: 4, name: 'L4', work: 'Reactive and loaded: kettlebell, med-ball, depth jumps.' },
];

export const POWER_LADDER_RULES =
  'Earned stages. Quality-gated, low volume, full recovery; pelvic-floor and shin gates throughout; bilateral before single-leg. Move up a level only when the gate is clean.';

/** The reference template's text: the ladder, as the coach's spec writes it. */
export const POWER_LADDER_TEMPLATE = [
  'Power & elasticity ladder — L1 to L4 (reference)',
  '',
  ...POWER_LEVELS.map((l) => `${l.name} — ${l.work}`),
  '',
  POWER_LADDER_RULES,
  '',
  'Phase emphasis:',
  ...PHASES.map((p) => `${p.label}: ${p.emphasis}`),
  '',
  'Blocks of about four weeks: three progressive load weeks and a deload. The deload is conditional: week 4 deloads only if the three load weeks were actually completed; otherwise hold or repeat. Progress by load within a block.',
].join('\n');
