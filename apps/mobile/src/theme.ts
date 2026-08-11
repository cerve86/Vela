import { useColorScheme } from 'react-native';
import { palette, radius, space, typography } from '@vela/shared/tokens';

/**
 * The iOS side of the same token set the portal uses. Both read from
 * packages/shared/src/tokens.ts, so a colour never drifts between surfaces.
 */

/** Named font faces, so screens never hardcode a PostScript name. */
export const font = {
  display: 'Outfit_800ExtraBold',
  displayBold: 'Outfit_700Bold',
  displaySemi: 'Outfit_600SemiBold',
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

export function useTheme() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const chrome = dark ? palette.chrome.dark : palette.chrome.light;

  return {
    dark,
    ...chrome,
    brand: palette.brand,
    accent: palette.accent,
    status: palette.status,
    tint: palette.tint,
    series: dark ? palette.series.dark : palette.series.light,
    space,
    radius,
    typography,
    font,
    /** Tinted fills need to flip in dark mode — a cream card on black reads as a bug. */
    softFill: dark ? 'rgba(255,255,255,0.06)' : palette.tint.chip,
    inputFill: dark ? 'rgba(255,255,255,0.08)' : palette.tint.chip,
  };
}

export type Theme = ReturnType<typeof useTheme>;
