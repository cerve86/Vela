import { useColorScheme } from 'react-native';
import { palette, radius, space, typography } from '@coachapp/shared/tokens';

/**
 * The iOS side of the same token set the portal uses. Both read from
 * packages/shared/src/tokens.ts, so a colour never drifts between surfaces.
 */
export function useTheme() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const chrome = dark ? palette.chrome.dark : palette.chrome.light;

  return {
    dark,
    ...chrome,
    brand: palette.brand,
    status: palette.status,
    series: dark ? palette.series.dark : palette.series.light,
    space,
    radius,
    typography,
  };
}

export type Theme = ReturnType<typeof useTheme>;
