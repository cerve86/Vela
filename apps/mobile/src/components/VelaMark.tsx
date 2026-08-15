import Svg, { G, Path, Rect } from 'react-native-svg';
import { palette } from '@vela/shared/tokens';

/**
 * The Vela mark — a mainsail and a jib on a shared mast.
 *
 * The mast slot is 4 of the 48 grid units wide. At 3 it closes up below ~40px and the
 * two sails read as one triangle, which is the whole mark gone.
 *
 * The transform centres the artwork's own bounding box rather than the 48-unit grid,
 * and lifts it a touch: a sail is bottom-heavy and sits low when centred geometrically.
 *
 * Source of truth is design/brand/mark-sloop.svg — edit there, then mirror here.
 */

const MAINSAIL = 'M26.5 4 L26.5 41 L45 41 C42 27 36 13.5 26.5 4 Z';
const JIB = 'M22.5 11 L22.5 41 L7.5 41 C10.8 30.5 16 19.5 22.5 11 Z';

type Props = {
  size?: number;
  /** Corner radius in viewBox units — 48 units map to `size` px. */
  radius?: number;
};

/** The mark on its coral tile, sails knocked out in cream. */
export function VelaMark({ size = 40, radius = 14 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityLabel="Vela">
      <Rect width="48" height="48" rx={radius} fill={palette.brand[600]} />
      <G transform="translate(1.8 3.5) scale(0.845)">
        <Path d={MAINSAIL} fill={palette.chrome.light.page} />
        <Path d={JIB} fill={palette.brand[200]} />
      </G>
    </Svg>
  );
}

/** The bare sails, no tile — for cream grounds where a coral chip would be too loud. */
export function VelaSail({ size = 28 }: Pick<Props, 'size'>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityLabel="Vela">
      <Path d={MAINSAIL} fill={palette.brand[600]} />
      <Path d={JIB} fill={palette.brand[400]} />
    </Svg>
  );
}
