/**
 * Design tokens shared by the coach portal and the iOS app.
 *
 * The chart palette is the validated reference instance — it clears the lightness
 * band, chroma floor, CVD separation, normal-vision floor and contrast checks against
 * *our* surfaces in both light and dark mode. Do not hand-edit these hexes; if the
 * brand changes, re-run the palette validator and paste the passing result.
 *
 * Light mode leaves aqua, yellow and magenta below 3:1 on white by design — the
 * mitigation is direct labels + legend on every chart, never color alone.
 */

export const palette = {
  /** Brand chrome: nav, primary buttons, focus rings. Deliberately NOT a series color. */
  brand: {
    50: '#F0FDFA',
    100: '#CCFBF1',
    300: '#5EEAD4',
    500: '#14B8A6',
    600: '#0D9488',
    700: '#0F766E',
    800: '#115E59',
    900: '#134E4A',
  },

  /** Categorical series slots — assigned in fixed order, never cycled. */
  series: {
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  },

  /** Single-hue ramp for magnitude (heatmaps, load density). */
  sequential: {
    100: '#cde2fb',
    200: '#9ec5f4',
    300: '#6da7ec',
    400: '#3987e5',
    500: '#256abf',
    600: '#184f95',
    700: '#0d366b',
  },

  /** Reserved for state. Never reused as a series color. Always paired with icon + label. */
  status: {
    good: '#0ca30c',
    warning: '#fab219',
    serious: '#ec835a',
    critical: '#d03b3b',
  },

  chrome: {
    light: {
      surface: '#ffffff',
      page: '#f7f8f8',
      raised: '#ffffff',
      textPrimary: '#0b0b0b',
      textSecondary: '#52514e',
      textMuted: '#898781',
      grid: '#e6e7e5',
      axis: '#c3c2b7',
      border: 'rgba(11,11,11,0.10)',
      successText: '#006300',
    },
    dark: {
      surface: '#16181a',
      page: '#0c0e10',
      raised: '#1e2124',
      textPrimary: '#ffffff',
      textSecondary: '#c3c2b7',
      textMuted: '#898781',
      grid: '#282b2e',
      axis: '#383835',
      border: 'rgba(255,255,255,0.10)',
      successText: '#0ca30c',
    },
  },
} as const;

/**
 * Pain 0-10 rendered as a diverging-by-severity ramp. Pain is a clinical state, not a
 * data series, so it draws from the status palette rather than the categorical slots.
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

/** Adherence band → status color + label. Icon supplied by the UI layer. */
export const adherenceStyle = {
  good: { color: palette.status.good, label: 'On track' },
  watch: { color: palette.status.warning, label: 'Watch' },
  poor: { color: palette.status.critical, label: 'At risk' },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;

export const typography = {
  family: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  size: { xs: 11, sm: 13, base: 15, lg: 17, xl: 20, xxl: 28, hero: 40 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
} as const;
