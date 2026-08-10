/**
 * Design tokens shared by the coach portal and the iOS app.
 *
 * Visual direction is taken from the "Fitness Coaching App" reference: a deep spearmint
 * green on white, a violet secondary accent, very round cards, and heavy display type
 * against light body text. The brand green and the categorical series were sampled from
 * that reference; the reserved status colours were NOT — they stay on the previously
 * validated set, because those four are chosen specifically to remain distinguishable
 * from the series slots, and re-deriving that relationship by eye would break it.
 *
 * The series palette clears the lightness band, chroma floor, CVD separation,
 * normal-vision floor and contrast checks against our own surfaces in both modes.
 * Do not hand-edit these hexes — re-run the palette validator and paste a passing result.
 *
 * Light mode leaves yellow and magenta below 3:1 on white by design; the mitigation is
 * direct labels plus a legend on every chart, never colour alone.
 */

export const palette = {
  /** Brand chrome: nav, primary buttons, focus rings, active states. Sampled: #008460. */
  brand: {
    50: '#EDF8F4',
    100: '#D2EFE5',
    200: '#A5DFCB',
    300: '#63C7A7',
    400: '#26A87F',
    500: '#00966D',
    600: '#008460',
    700: '#026E51',
    800: '#065842',
    900: '#074635',
  },

  /** Secondary accent — links, selected rings, the occasional highlight. Sampled: #5838C8. */
  accent: {
    100: '#E7E2FB',
    300: '#B0A2F0',
    500: '#5838C8',
    700: '#432AA0',
  },

  /** Categorical series slots — assigned in fixed order, never cycled. */
  series: {
    light: ['#008460', '#5838c8', '#eb6834', '#2a78d6', '#eda100', '#e87ba4'],
    dark: ['#12a37a', '#8b78ee', '#d95926', '#3987e5', '#c98500', '#d55181'],
  },

  /** Single-hue ramp for magnitude (heatmaps, load density). */
  sequential: {
    100: '#D2EFE5',
    200: '#A5DFCB',
    300: '#63C7A7',
    400: '#26A87F',
    500: '#008460',
    600: '#026E51',
    700: '#074635',
  },

  /** Reserved for state. Never reused as a series colour. Always paired with icon + label. */
  status: {
    good: '#0ca30c',
    warning: '#fab219',
    serious: '#ec835a',
    critical: '#d03b3b',
  },

  /** Soft tinted surfaces lifted from the reference — promo cards, availability blocks. */
  tint: {
    cream: '#FFFBED',
    mint: '#EFF8F3',
    lilac: '#F2EFFC',
    chip: '#F5F6F5',
  },

  chrome: {
    light: {
      surface: '#ffffff',
      page: '#F4F6F5',
      raised: '#ffffff',
      textPrimary: '#0B0F0D',
      textSecondary: '#5A625E',
      textMuted: '#949B97',
      grid: '#E8EBE9',
      axis: '#C6CCC9',
      border: 'rgba(11,15,13,0.08)',
      successText: '#026E51',
    },
    dark: {
      surface: '#14171A',
      page: '#0A0C0E',
      raised: '#1C2024',
      textPrimary: '#FFFFFF',
      textSecondary: '#B9C0BC',
      textMuted: '#868E8A',
      grid: '#262B2E',
      axis: '#39403D',
      border: 'rgba(255,255,255,0.09)',
      successText: '#12a37a',
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

/** Generously round, following the reference: pill rows, soft cards, circular avatars. */
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const typography = {
  /** Headlines and numbers that carry weight — heavy, tight, geometric. */
  display: 'Outfit',
  /** Body, labels and data. Has true tabular figures, which a clinical table needs. */
  body: 'PlusJakartaSans',
  size: { xs: 11, sm: 13, base: 15, lg: 17, xl: 20, xxl: 28, hero: 40 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700', black: '800' },
  /** Display type in the reference is set tight; body stays neutral. */
  tracking: { display: -0.6, body: 0 },
} as const;
