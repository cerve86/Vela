import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  BRAND_FILLS,
  BRAND_GROUND,
  BRAND_VIEWBOX,
  SAIL_JIB,
  SAIL_MAIN,
  VELA_ICON_VIEWBOX,
  velaIcons,
  type BrandFillMode,
  type VelaIconName,
  type VelaIconSpec,
} from '@vela/shared';

/** The Vela mark, drawn from the shared geometry the portal and the app icon also use. */
export function VelaMark({
  size = 24,
  mode = 'onLight',
}: {
  size?: number;
  mode?: BrandFillMode;
}) {
  const fills = BRAND_FILLS[mode];
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BRAND_VIEWBOX} ${BRAND_VIEWBOX}`}>
      <Path d={SAIL_JIB} fill={fills.jib} />
      <Path d={SAIL_MAIN} fill={fills.main} />
    </Svg>
  );
}

/** The reversed mark on its coral ground. */
export function VelaBadge({ size = 40, radius }: { size?: number; radius?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? size * 0.28,
        backgroundColor: BRAND_GROUND,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <VelaMark size={size * 0.62} mode="onBrand" />
    </View>
  );
}

/**
 * One of Vela's own icons.
 *
 * Same props as a `lucide-react-native` icon — `size`, `color`, `strokeWidth` — so the two
 * sets swap freely at a call site.
 */
export function VelaIcon({
  name,
  size = 24,
  color = 'currentColor',
  strokeWidth = 2,
}: {
  name: VelaIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const spec: VelaIconSpec = velaIcons[name];
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VELA_ICON_VIEWBOX} ${VELA_ICON_VIEWBOX}`}>
      {spec.paths.map((d) => (
        <Path
          key={d}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {spec.circles?.map((c) => (
        <Circle
          key={`${c.cx}-${c.cy}-${c.r}`}
          cx={c.cx}
          cy={c.cy}
          r={c.r}
          fill={c.fill ? color : 'none'}
          stroke={c.fill ? 'none' : color}
          strokeWidth={strokeWidth}
        />
      ))}
    </Svg>
  );
}
