/**
 * Vela's own icons — the nine concepts Lucide genuinely lacks.
 *
 * Drawn on the Lucide grid so they sit beside it without looking like a second set: a
 * 24 box, 2px round strokes, no fills, `currentColor` supplied by the caller. Anything
 * Lucide already does well stays Lucide; adding a house here would only guarantee the two
 * sets drift apart.
 *
 * Path data lives in shared so the portal and the app draw the identical glyph. Each entry
 * is a list of subpaths rather than one string, because several of these need a closed
 * shape next to an open stroke and merging them would force fill rules we do not want.
 */

export interface VelaIconSpec {
  /** Stroked subpaths. */
  paths: string[];
  /** Circles drawn as marks — cheaper and rounder than approximating with arcs. */
  circles?: { cx: number; cy: number; r: number; fill?: boolean }[];
  /** One line, for the icon browser and for aria-labels when nothing better exists. */
  meaning: string;
}

export const VELA_ICON_VIEWBOX = 24;

export const velaIcons = {
  /** Vela's own glyph — splash, empty states, the brand slot in a nav. */
  sail: {
    paths: ['M11 4 L11 19 L19.5 19 Q17 11 11 4 Z', 'M5.5 19 H11'],
    meaning: 'Vela',
  },

  /** Streak and adherence: the sail plus the water it has already covered. */
  wake: {
    paths: ['M13 3 L13 14 L20 14 Q18 8 13 3 Z', 'M3.5 17.5 H17', 'M6.5 20.5 H20'],
    meaning: 'Streak',
  },

  /** The morning readiness check, as a wind gauge rather than a medical dial. */
  readiness: {
    // A 270° dial with the gap at the bottom, not a semicircle: a half-dome plus a short
    // needle reads as a hill, and the needle vanishes into the arc at tab-bar sizes.
    paths: ['M5.64 18.36 A9 9 0 1 1 18.36 18.36', 'M12 12 L16.4 7.9'],
    circles: [{ cx: 12, cy: 12, r: 1.4, fill: true }],
    meaning: 'Readiness',
  },

  /** A joint on a limb — where it hurts, without a body diagram. */
  'pain-point': {
    paths: ['M4 20 L8.8 15.2', 'M15.2 8.8 L20 4'],
    circles: [
      { cx: 12, cy: 12, r: 4.2 },
      { cx: 12, cy: 12, r: 1.3, fill: true },
    ],
    meaning: 'Pain',
  },

  /** Angle at a pivot: the measurement a physio actually records. */
  'range-of-motion': {
    paths: ['M4.5 19.5 H20', 'M4.5 19.5 L16.5 7.5', 'M13 19.5 A8.5 8.5 0 0 0 10.5 13.5'],
    meaning: 'Range of motion',
  },

  /** Sets and reps as a bracketed group, not a dumbbell. */
  'sets-reps': {
    paths: ['M7.5 4 H5 V20 H7.5', 'M16.5 4 H19 V20 H16.5', 'M9.5 9 H14.5', 'M9.5 12 H14.5', 'M9.5 15 H12.5'],
    meaning: 'Sets and reps',
  },

  /** Metronome — the tempo prescription on an exercise. */
  tempo: {
    paths: ['M9.5 3.5 H14.5 L18.5 20.5 H5.5 Z', 'M12 20.5 L14 8'],
    meaning: 'Tempo',
  },

  /** A training block: progression inside a bounded period. */
  'program-block': {
    paths: [
      'M7 3.5 H17 A3.5 3.5 0 0 1 20.5 7 V17 A3.5 3.5 0 0 1 17 20.5 H7 A3.5 3.5 0 0 1 3.5 17 V7 A3.5 3.5 0 0 1 7 3.5 Z',
      'M8.5 16 V13',
      'M12 16 V10',
      'M15.5 16 V7.5',
    ],
    meaning: 'Programme block',
  },

  /** Progress that wanders and still rises. Honest about how recovery goes. */
  'trend-wave': {
    paths: ['M3 16.5 Q6 11 9 13.5 T15 10 T21 7.5'],
    meaning: 'Trend',
  },
} satisfies Record<string, VelaIconSpec>;

export type VelaIconName = keyof typeof velaIcons;

export const VELA_ICON_NAMES = Object.keys(velaIcons) as VelaIconName[];
