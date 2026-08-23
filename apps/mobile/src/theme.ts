import { useColorScheme } from 'react-native';
import { mealSlots, motion, palette, radius, space, tide, typography } from '@vela/shared/tokens';

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
    vitals: palette.vitals,
    series: dark ? palette.series.dark : palette.series.light,
    sequential: dark ? palette.sequential.dark : palette.sequential.light,
    mealSlots,
    tide,
    motion,
    space,
    radius,
    typography,
    font,
    /**
     * The illustrated band behind the greeting. Light mode is the design's own pale blue;
     * dark lifts it just clear of the page so the band still reads as a distinct surface
     * rather than a seam. Both are flat — the line-art inside carries the depth.
     */
    bandFill: dark ? '#1A2136' : palette.brand[100],
    bandLine: dark ? 'rgba(143,174,255,0.16)' : 'rgba(27,79,216,0.10)',
    /** Track behind the readiness dial and any ring drawn on the band. */
    dialTrack: dark ? '#2A3150' : '#D3E0FA',
    dialTicks: dark ? '#333C5E' : '#BFD2F6',

    /** Two-series trend, stepped per mode. Both modes pass the palette checker. */
    chartAdherence: dark ? palette.chart.dark.adherence : palette.chart.light.adherence,
    chartSoreness: dark ? palette.chart.dark.soreness : palette.chart.light.soreness,

    /**
     * Heatmap states. `missed` lifts in dark mode — the light grey it uses there would
     * disappear into the card entirely, turning "you missed this" into "nothing here".
     */
    heatmapFull: palette.heatmap.full,
    heatmapPartial: palette.heatmap.partial,
    heatmapMissed: dark ? '#3A4368' : palette.heatmap.missed,
    /** Tinted fills need to flip in dark mode — a cream card on black reads as a bug. */
    softFill: dark ? 'rgba(255,255,255,0.06)' : palette.tint.chip,
    inputFill: dark ? 'rgba(255,255,255,0.08)' : palette.tint.chip,
  };
}

export type Theme = ReturnType<typeof useTheme>;
