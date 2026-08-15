/**
 * Design tokens shared by the coach portal and the iOS app.
 *
 * Direction: "Sunrise". Coral leads, plum supports, cream replaces white. The category
 * this app competes in is uniformly green, blue or black on white; warm-on-cream is the
 * one register nobody else is using, and it matches a product whose copy is encouraging
 * rather than clinical.
 *
 * Two coral steps do different jobs and must not be swapped. `brand[500]` is the identity
 * colour — it is what the eye reads as Vela, and it is the first categorical series slot.
 * `brand[600]` is the interactive step, darkened until white label text clears 4.5:1
 * (#FF5A45 only manages 3.09:1, which is why the button is not simply the brand colour).
 *
 * The series palette clears the lightness band, chroma floor, CVD separation,
 * normal-vision floor and contrast checks against our own surfaces in both modes.
 * Do not hand-edit these hexes — re-run the palette validator and paste a passing result.
 *
 * Slot 3 (green) and slot 4 (gold) are ordered apart from each other on purpose: adjacent,
 * that pair scored ΔE 4.9 under tritanopia, below the floor. Separated it reads 22.4.
 *
 * Light mode leaves gold below 3:1 on cream by design; the mitigation is direct labels
 * plus a legend on every chart, never colour alone.
 */

export const palette = {
  /** Brand chrome: nav, primary buttons, focus rings, active states. Identity: #FF5A45. */
  brand: {
    50: '#FFF4F1',
    100: '#FFE5DF',
    200: '#FFC6B9',
    300: '#FF9E8B',
    400: '#FF7B63',
    /** The identity coral. Charts, dots, accents — never white text on top of it. */
    500: '#FF5A45',
    /** The interactive coral. Buttons and links; white text clears 4.5:1 here. */
    600: '#D93A24',
    700: '#B32E1B',
    800: '#8C2415',
    900: '#661A0F',
  },

  /** Secondary accent — today's ring, selected states, the occasional highlight. */
  accent: {
    100: '#F1E9FB',
    300: '#C4A3EA',
    500: '#7A2FB8',
    700: '#5A1F8C',
  },

  /** Categorical series slots — assigned in fixed order, never cycled. */
  series: {
    light: ['#FF5A45', '#7A2FB8', '#0E9F6E', '#E8A200', '#2D6BF0', '#E0489B'],
    dark: ['#F0553F', '#9A5AD8', '#12A377', '#C28900', '#4A80F0', '#DB4F97'],
  },

  /** Single-hue ramp for magnitude (heatmaps, load density). */
  sequential: {
    100: '#FFE5DF',
    200: '#FFC6B9',
    300: '#FF9E8B',
    400: '#FF7B63',
    500: '#FF5A45',
    600: '#B32E1B',
    700: '#661A0F',
  },

  /**
   * Reserved for state. Never reused as a series colour. Always paired with icon + label.
   *
   * `critical` is a berry crimson rather than the obvious red: next to a coral brand, a
   * plain red pill reads as a button. `serious` is pulled towards burnt orange for the
   * same reason — it has to be legible as a warning, not as chrome.
   */
  status: {
    good: '#0B8F5A',
    warning: '#B87A00',
    serious: '#B85A12',
    critical: '#C4184A',
  },

  /** Soft tinted grounds — promo cards, empty states, section blocks. */
  tint: {
    /** A step deeper than `page`, or a card filled with it would vanish into the page. */
    cream: '#FFEFE2',
    peach: '#FFF1EA',
    lilac: '#F3ECFB',
    mint: '#E9F7F1',
    chip: '#F6EFE8',
  },

  chrome: {
    light: {
      surface: '#FFFFFF',
      page: '#FFF6EF',
      raised: '#FFFFFF',
      textPrimary: '#1F1512',
      textSecondary: '#6B5B54',
      textMuted: '#8A7A71',
      grid: '#EFE4DA',
      axis: '#DCCCC0',
      border: 'rgba(31,21,18,0.09)',
      successText: '#0B7A4B',
    },
    dark: {
      surface: '#241A16',
      page: '#191310',
      raised: '#2E221C',
      textPrimary: '#F8EFE9',
      textSecondary: '#BCADA4',
      textMuted: '#8C7D74',
      grid: '#33261F',
      axis: '#4A3931',
      border: 'rgba(248,239,233,0.10)',
      successText: '#12A377',
    },
  },
} as const;

/**
 * Pain 0-10 rendered by severity. Pain is a clinical state, not a data series, so it
 * draws from the reserved status palette rather than the categorical slots.
 */
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

/** Adherence band → status colour + label. Icon supplied by the UI layer. */
export const adherenceStyle = {
  good: { color: palette.status.good, label: 'On track' },
  watch: { color: palette.status.warning, label: 'Watch' },
  poor: { color: palette.status.critical, label: 'At risk' },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Generously round: pill rows, soft cards, circular avatars. */
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const typography = {
  /** Headlines and numbers that carry weight — heavy, tight, geometric. */
  display: 'Outfit',
  /** Body, labels and data. Has true tabular figures, which a clinical table needs. */
  body: 'PlusJakartaSans',
  size: { xs: 11, sm: 13, base: 15, lg: 17, xl: 20, xxl: 28, hero: 40 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700', black: '800' },
  tracking: { display: -0.6, body: 0 },
} as const;
