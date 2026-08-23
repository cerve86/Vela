/**
 * Vela's spot illustrations, in the flat "Surface" register: one soft ground shape with
 * simple geometric objects on it, no outlines, no gradients.
 *
 * Two decisions worth stating, because both were deliberate.
 *
 * Nobody is drawn. Every stock illustration pack renders the same slim, upright,
 * un-postpartum body, and dropping that into an app whose written voice refuses "bounce
 * back" would undo that work in a single image — the kind of thing a client notices before
 * she notices anything else. Objects and scenes carry the same warmth with none of that.
 *
 * Colours are semantic slots, not hexes. An illustration appears on a cream page in light
 * mode and a near-black one in dark, so the ground and the paper have to swap with the
 * theme; baking in `#FFEFE2` would leave a bright card glowing on a dark screen.
 */

export type IllustrationSlot =
  | 'ground'
  | 'paper'
  | 'primary'
  | 'primaryDeep'
  | 'accent'
  | 'gold'
  | 'ink';

export type IllustrationShape =
  | { t: 'circle'; cx: number; cy: number; r: number; fill: IllustrationSlot }
  | {
      t: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      rx?: number;
      fill: IllustrationSlot;
    }
  | {
      t: 'path';
      d: string;
      fill?: IllustrationSlot;
      stroke?: IllustrationSlot;
      sw?: number;
    };

export interface Illustration {
  /** Every illustration is drawn on the same 200 × 150 stage so they crop alike. */
  shapes: IllustrationShape[];
  /** Used as the accessible description wherever one is not supplied. */
  alt: string;
}

export const ILLUSTRATION_W = 200;
export const ILLUSTRATION_H = 150;

export const illustrations = {
  /** Rest day. A mug, because rest should look like something you'd want. */
  rest: {
    alt: 'A mug of tea',
    shapes: [
      { t: 'circle', cx: 100, cy: 76, r: 60, fill: 'ground' },
      // Steam first, so the mug overlaps it rather than the other way round.
      { t: 'path', d: 'M86 46 q7 -9 0 -18', stroke: 'primaryDeep', sw: 5 },
      { t: 'path', d: 'M104 46 q7 -9 0 -18', stroke: 'primaryDeep', sw: 5 },
      { t: 'path', d: 'M128 76 a13 13 0 0 1 0 26', stroke: 'primaryDeep', sw: 7 },
      { t: 'rect', x: 68, y: 58, w: 58, h: 52, rx: 10, fill: 'primary' },
      { t: 'rect', x: 68, y: 58, w: 58, h: 12, rx: 6, fill: 'paper' },
      { t: 'rect', x: 58, y: 112, w: 78, h: 8, rx: 4, fill: 'primaryDeep' },
    ],
  },

  /** Nothing logged. An empty plate says it without a word. */
  plate: {
    alt: 'An empty plate with a fork and knife',
    shapes: [
      { t: 'circle', cx: 100, cy: 75, r: 60, fill: 'ground' },
      { t: 'rect', x: 46, y: 46, w: 7, h: 58, rx: 3.5, fill: 'accent' },
      { t: 'rect', x: 147, y: 46, w: 7, h: 58, rx: 3.5, fill: 'accent' },
      { t: 'circle', cx: 100, cy: 75, r: 42, fill: 'paper' },
      { t: 'circle', cx: 100, cy: 75, r: 30, fill: 'ground' },
    ],
  },

  /** No clients yet. Two cards, one waiting to be filled. */
  roster: {
    alt: 'Two client cards',
    shapes: [
      { t: 'circle', cx: 100, cy: 75, r: 60, fill: 'ground' },
      { t: 'rect', x: 44, y: 40, w: 88, h: 62, rx: 12, fill: 'paper' },
      { t: 'rect', x: 70, y: 58, w: 88, h: 62, rx: 12, fill: 'primary' },
      { t: 'circle', cx: 92, cy: 80, r: 12, fill: 'paper' },
      { t: 'rect', x: 112, y: 72, w: 34, h: 7, rx: 3.5, fill: 'paper' },
      { t: 'rect', x: 112, y: 85, w: 22, h: 7, rx: 3.5, fill: 'paper' },
    ],
  },

  /** Nothing measured yet. A card with one bar standing up in it. */
  trend: {
    alt: 'A chart with a single bar',
    shapes: [
      { t: 'circle', cx: 100, cy: 75, r: 60, fill: 'ground' },
      { t: 'rect', x: 46, y: 38, w: 108, h: 74, rx: 12, fill: 'paper' },
      { t: 'path', d: 'M62 54 q20 -8 38 -2 t36 -6', stroke: 'accent', sw: 4 },
      { t: 'rect', x: 60, y: 88, w: 14, h: 12, rx: 5, fill: 'ground' },
      { t: 'rect', x: 82, y: 76, w: 14, h: 24, rx: 5, fill: 'ground' },
      { t: 'rect', x: 104, y: 64, w: 14, h: 36, rx: 5, fill: 'primary' },
      { t: 'rect', x: 126, y: 82, w: 14, h: 18, rx: 5, fill: 'ground' },
    ],
  },

  /** Sign-in and first run. The mark's own sails, on water. */
  welcome: {
    alt: 'A sailing boat on water',
    shapes: [
      { t: 'circle', cx: 100, cy: 72, r: 60, fill: 'ground' },
      { t: 'circle', cx: 136, cy: 42, r: 14, fill: 'gold' },
      { t: 'path', d: 'M92 34 L92 92 L69 92 Q78 60 92 34 Z', fill: 'primary' },
      { t: 'path', d: 'M98 22 L98 92 L128 92 Q120 52 98 22 Z', fill: 'primaryDeep' },
      { t: 'path', d: 'M52 100 L148 100 L134 116 L66 116 Z', fill: 'accent' },
      { t: 'path', d: 'M40 128 q16 -9 32 0 t32 0 t32 0', stroke: 'primary', sw: 5 },
    ],
  },

  /** Scan a barcode. The one place a client points a camera at something. */
  scan: {
    alt: 'A barcode being scanned',
    shapes: [
      { t: 'circle', cx: 100, cy: 75, r: 60, fill: 'ground' },
      { t: 'rect', x: 50, y: 44, w: 100, h: 62, rx: 12, fill: 'paper' },
      { t: 'rect', x: 64, y: 58, w: 6, h: 34, rx: 3, fill: 'ink' },
      { t: 'rect', x: 76, y: 58, w: 4, h: 34, rx: 2, fill: 'ink' },
      { t: 'rect', x: 86, y: 58, w: 8, h: 34, rx: 4, fill: 'ink' },
      { t: 'rect', x: 100, y: 58, w: 4, h: 34, rx: 2, fill: 'ink' },
      { t: 'rect', x: 110, y: 58, w: 7, h: 34, rx: 3.5, fill: 'ink' },
      { t: 'rect', x: 123, y: 58, w: 5, h: 34, rx: 2.5, fill: 'ink' },
      { t: 'rect', x: 44, y: 71, w: 112, h: 7, rx: 3.5, fill: 'primaryDeep' },
    ],
  },
} satisfies Record<string, Illustration>;

export type IllustrationName = keyof typeof illustrations;

export const ILLUSTRATION_NAMES = Object.keys(illustrations) as IllustrationName[];

/**
 * Slot → hex, per theme.
 *
 * Dark is stepped, not inverted: `primaryDeep` becomes *lighter* than `primary` there,
 * because on a near-black ground the deep coral disappears while the pale one carries.
 */
export const ILLUSTRATION_PALETTE = {
  light: {
    ground: '#EDF1FB',
    paper: '#FFFFFF',
    primary: '#5C87F7',
    primaryDeep: '#1B4FD8',
    accent: '#7C3AED',
    gold: '#E8A200',
    ink: '#12172B',
  },
  dark: {
    ground: '#1E2438',
    paper: '#2E3650',
    primary: '#5C87F7',
    primaryDeep: '#B8CCFF',
    accent: '#9A5AD8',
    gold: '#C28900',
    ink: '#EEF2FF',
  },
} as const;
