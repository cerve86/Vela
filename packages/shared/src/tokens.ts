/**
 * Design tokens shared by the coach portal and the iOS app.
 *
 * Direction: "Poppy blue", ported from the Claude Design project "Coaching App Flow
 * Redesign" (handoff/TOKENS.md). It replaces the earlier warm "Sunrise" scheme wholesale.
 *
 * The structure below is deliberately unchanged from Sunrise — same groups, same steps,
 * same names — so the swap is a change of value and not a change of shape. Every consumer
 * reads `brand[600]`, `tint.cream`, `chrome.light.page` and so on, and none of them need
 * editing to follow a repaint. Anything the new design introduces (meal slots, readiness
 * steps, motion) is added as a new group rather than folded into an existing one.
 *
 * Two blue steps do different jobs and must not be swapped. `brand[600]` (#1B4FD8) is both
 * the identity colour and the interactive one — white label text clears 4.5:1 on it, which
 * is what the coral scheme needed a separate darker step for. `brand[400]` is decorative
 * only: plan bullets and dots, never a surface behind white text.
 *
 * DARK MODE IS DERIVED, NOT DESIGNED. The prototype is light-only and the handoff supplies
 * no dark values, but the app ships `userInterfaceStyle: automatic` and every screen reads
 * `chrome.dark`. The dark scheme below is therefore an interpretation: hues held, lightness
 * inverted, `brand` lifted to stay visible on a near-black ground. It is coherent, and it
 * is not the designer's intent — treat it as a placeholder to be reviewed, not as spec.
 */

export const palette = {
  /** Brand chrome: nav, primary buttons, active tab, illustrated band, progress fill. */
  brand: {
    50: '#F2F6FF',
    100: '#EDF1FB',
    200: '#B8CCFF',
    300: '#8FAEFF',
    400: '#5C87F7',
    /**
     * Interpolated between 400 and 600. The design names no 500, but three existing call
     * sites read one, and leaving a hole in a numeric ramp invites someone to reach for
     * 600 and quietly lose the distinction between decorative and interactive.
     */
    500: '#3B6BE8',
    /** Identity AND interactive. White text clears 4.5:1 here. */
    600: '#1B4FD8',
    700: '#1B3E9E',
    800: '#163788',
    900: '#122C6C',
  },

  /** Secondary accent — kept for the plum highlights the portal still uses. */
  accent: {
    100: '#EDE9FE',
    300: '#C4A3EA',
    500: '#7C3AED',
    700: '#5B21B6',
  },

  /**
   * Categorical series.
   *
   * NOT YET RE-VALIDATED. The Sunrise series palette was checked against the lightness
   * band, chroma floor, CVD separation, normal-vision floor and contrast on our own
   * surfaces. These values come from the design's own vitals assignments instead, and have
   * not been through that validator. It matters less than it did — the redesign's charts
   * are mono (one ink, one line, one mean), so categorical separation is only load-bearing
   * on the portal's multi-series panels. Run the validator before shipping those.
   */
  series: {
    light: ['#1B4FD8', '#7C3AED', '#0E9F6E', '#E8A200', '#E0489B', '#0EA5B7'],
    dark: ['#5C87F7', '#9A5AD8', '#12A377', '#C28900', '#DB4F97', '#22B8CB'],
  },

  /** Ordered ramp for the attendance heatmap: empty -> full. */
  sequential: {
    light: ['#EDF1FB', '#8FAEFF', '#5C87F7', '#12172B'],
    dark: ['#1E2438', '#2F4A86', '#4C74C8', '#B8CCFF'],
  },

  status: {
    good: '#0B8F5A',
    /** Heatmap fill for a fully-attended day — brighter than `good`, which is for text. */
    goodFill: '#0E9F6E',
    warning: '#B87A00',
    /** Partial attendance, and the snack slot glyph. */
    warningFill: '#E8A200',
    serious: '#B85A12',
    critical: '#C4184A',
  },

  /**
   * Vitals identity colours, fixed per metric so a metric never changes colour between
   * screens.
   *
   * These are NEVER drawn adjacent to one another. `hrv` and `weight` sit ΔE 12.7 apart in
   * normal vision — below the floor of 15, meaning full-colour readers struggle, before
   * colour vision deficiency is even considered. That is survivable only because the vitals
   * chart is mono: one metric at a time, and the line is drawn in ink rather than in the
   * metric's colour. Put two of these in one chart and it fails; `#C026D3` is the tested
   * replacement for `hrv` if that day comes.
   */
  vitals: {
    hrv: '#7C3AED',
    weight: '#2D6BF0',
    restingHr: '#0E9F6E',
    steps: '#E8A200',
  },

  /**
   * The two-series trend chart: adherence against soreness.
   *
   * Blue and pink, stepped per mode from the same two ramps. The prototype ran blue on
   * pale blue, which passes in light and fails outright in dark — the pale step falls
   * outside the dark lightness band and below the chroma floor, so it reads as grey on a
   * near-black card. A hue pair survives both modes where a lightness pair cannot.
   *
   * Validated with the palette checker in both modes: lightness, chroma, CVD separation,
   * normal-vision floor and contrast all pass. Do not hand-edit — re-run it.
   */
  chart: {
    light: { adherence: '#1B4FD8', soreness: '#E0489B' },
    dark: { adherence: '#5C87F7', soreness: '#DB4F97' },
  },

  /**
   * Attendance heatmap states.
   *
   * `full` and `partial` are the two that carry meaning and clear CVD separation between
   * them (ΔE 11.2 protan). `missed` is deliberately a low-chroma grey — absence, not a
   * third category — which is why it would fail a categorical check and should never be
   * fed to one. Amber sits at 2.13:1 on white, so the grid ships with a labelled legend
   * rather than relying on colour.
   */
  heatmap: {
    full: '#0E9F6E',
    partial: '#E8A200',
    missed: '#C3CCE4',
  },

  /**
   * Tints. `cream` and `peach` keep their names despite being blue now: they are referenced
   * across both apps, and renaming them would be a large diff that changes nothing visible.
   * Read them as "the soft one" and "the softer one".
   */
  tint: {
    /** A step deeper than `page`, or a card filled with it would vanish into the page. */
    cream: '#EDF1FB',
    peach: '#F5F8FF',
    lilac: '#EDE9FE',
    mint: '#E4F6F0',
    chip: '#F3F5F9',
  },

  chrome: {
    light: {
      surface: '#FFFFFF',
      page: '#F2F6FF',
      raised: '#FFFFFF',
      textPrimary: '#12172B',
      textSecondary: '#57608A',
      textMuted: '#7C86AE',
      grid: '#DDE3F2',
      axis: '#C3CCE4',
      border: 'rgba(18,23,43,0.09)',
      inputFill: '#F3F5F9',
      shadow: 'rgba(18,23,43,0.06)',
    },
    dark: {
      surface: '#171C2E',
      page: '#0E1220',
      raised: '#1E2438',
      textPrimary: '#EEF2FF',
      textSecondary: '#A9B3D4',
      textMuted: '#7C86AE',
      grid: '#2A3150',
      axis: '#3A4368',
      border: 'rgba(238,242,255,0.10)',
      inputFill: '#232A42',
      shadow: 'rgba(0,0,0,0.40)',
    },
  },
} as const;

/**
 * Meal slots. Colour, tint and glyph travel together as one row per slot — the handoff is
 * explicit that this pairing lives with the slot definition and is never re-derived per
 * component. Glyphs are on the Lucide grid the app already uses (24 box, 2px round
 * strokes, no fills) so they sit beside the existing set.
 *
 * Sunrise, bowl, plate, fruit: four moments of a day, not four clock faces.
 */
export const mealSlots = [
  {
    key: 'breakfast',
    label: 'Breakfast',
    color: '#E8A200',
    tint: '#FFF6E3',
    paths: ['M3.5 19h17', 'M7.5 15a4.5 4.5 0 0 1 9 0M12 4.5V7M5.9 7.9l1.7 1.7M18.1 7.9l-1.7 1.7'],
  },
  {
    key: 'lunch',
    label: 'Lunch',
    color: '#0E9F6E',
    tint: '#E4F6F0',
    paths: ['M3.5 11.5h17a8.5 8.5 0 0 1-17 0Z', 'M9 8c0-1.5 1.4-1.9 1.4-3.6M13.6 8c0-1.5 1.4-1.9 1.4-3.6'],
  },
  {
    key: 'dinner',
    label: 'Dinner',
    color: '#7C3AED',
    tint: '#EDE9FE',
    paths: ['M12 5.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Z', 'M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z'],
  },
  {
    key: 'snack',
    label: 'Snack',
    color: '#E0489B',
    tint: '#FDEBF4',
    paths: [
      'M12 8.5c-3.3 0-5.4 2.2-5.4 5.4 0 3.2 2.1 6.1 5.4 6.1s5.4-2.9 5.4-6.1c0-3.2-2.1-5.4-5.4-5.4Z',
      'M12 8.5c0-2.1 1.5-3.8 3.7-4.2',
    ],
  },
] as const;

export type MealSlotKey = (typeof mealSlots)[number]['key'];

/**
 * Readiness steps, 0-4. The bar height is part of the token because the readiness dial and
 * the battery both draw the same five-step scale and must agree.
 */
export const tide = [
  {
    label: 'Depleted',
    barH: 8,
    tone: '#E0489B',
    paths: [
      'M5 15a4 4 0 0 1 .8-7.9 5.5 5.5 0 0 1 10.5 1.2A3.8 3.8 0 0 1 18.5 15Z',
      'M8 19.5h2M14 19.5h2',
    ],
  },
  {
    label: 'Low',
    barH: 14,
    tone: '#E8A200',
    paths: ['M5.5 15.5a4 4 0 0 1 .8-7.9 5.5 5.5 0 0 1 10.2 1', 'M15 19a4 4 0 1 0 0-8h-1'],
  },
  {
    label: 'Steady',
    barH: 20,
    tone: '#2D6BF0',
    paths: ['M9.5 6.2a5 5 0 0 1 7.8 4.6A3.6 3.6 0 0 1 16.5 18H8a4 4 0 0 1-.6-8', 'M6.5 4.5V6M3 8h1.5'],
  },
  {
    label: 'Good',
    barH: 26,
    tone: '#0E9F6E',
    paths: [
      'M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z',
      'M12 3v2M12 19v2M3 12h2M19 12h2M5.8 5.8l1.4 1.4M16.8 16.8l1.4 1.4',
    ],
  },
  {
    label: 'Strong',
    barH: 32,
    tone: '#7C3AED',
    paths: ['M12 3.5 13.9 9h5.6l-4.6 3.4 1.8 5.5-4.7-3.4-4.7 3.4 1.8-5.5L4.5 9h5.6Z'],
  },
] as const;

/** Symptoms that downgrade the day's plan and block return-to-running testing outright. */
export const SYMPTOMS = ['Nothing', 'Pain', 'Heaviness', 'Dragging', 'Leaking'] as const;
export const BLOCKING_SYMPTOMS = ['Heaviness', 'Dragging', 'Leaking'] as const;

export function isBlocking(symptom: string): boolean {
  return (BLOCKING_SYMPTOMS as readonly string[]).includes(symptom);
}

/** Pain scoring. Thresholds unchanged; only the hexes move with the scheme. */
export function painColor(score: number): string {
  if (score <= 2) return palette.status.good;
  if (score <= 5) return palette.status.warning;
  if (score <= 7) return palette.status.serious;
  return palette.status.critical;
}

export function painLabel(score: number): string {
  if (score === 0) return 'No pain';
  if (score <= 2) return 'Minimal';
  if (score <= 5) return 'Moderate';
  if (score <= 7) return 'Significant';
  return 'Severe';
}

export const adherenceStyle = {
  good: { color: palette.status.good, label: 'On track' },
  watch: { color: palette.status.warning, label: 'Watch' },
  poor: { color: palette.status.critical, label: 'At risk' },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/**
 * Radii. Larger than Sunrise's throughout: the redesign leans on 28px cards and 24px
 * tiles, and the old 14px `md` read as a different product entirely next to them.
 */
export const radius = { sm: 10, md: 16, lg: 20, tile: 24, xl: 28, pill: 999 } as const;

export const typography = {
  /**
   * Two families, strictly divided. Outfit carries display and numerals only — headings,
   * stat values, timers, button labels. Plus Jakarta Sans carries everything that is read
   * as a sentence. Mixing them within a role is the fastest way to lose the look.
   */
  display: 'Outfit',
  body: 'PlusJakartaSans',
  mono: 'Menlo',
  size: { micro: 10, xs: 11.5, sm: 12.5, body: 13, base: 13.5, md: 15, lg: 16, xl: 24, xxl: 28, hero: 32 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700', black: '800' },
  tracking: { display: -0.6, hero: -1, body: 0, micro: 0.5 },
  lineHeight: { body: 19 },
} as const;

/**
 * Motion. Durations are tokens because the same rise is used on every card entry, and a
 * card that animates 50ms differently from its neighbour reads as a bug rather than a
 * flourish. Rest timers tick from one shared interval, never one per component.
 */
export const motion = {
  rise: { duration: 400, easing: 'ease' },
  pulse: { duration: 1800, easing: 'ease-in-out' },
  drift: { duration: 11000, easing: 'ease-in-out' },
  barFill: { duration: 600, easing: 'cubic-bezier(0.2,0.8,0.25,1)' },
  press: { duration: 150, scale: 0.965, easing: 'cubic-bezier(0.2,0.7,0.3,1)' },
} as const;

/** Minimum comfortable touch target. Set-tick rows and slot cards exceed this. */
export const TOUCH_MIN = 44;
