import Svg, { Circle, Path, Rect } from 'react-native-svg';
import {
  ILLUSTRATION_H,
  ILLUSTRATION_PALETTE,
  ILLUSTRATION_W,
  illustrations,
  type Illustration as IllustrationSpec,
  type IllustrationName,
} from '@vela/shared';
import { useTheme } from '@/theme';

/** A spot illustration, resolved against the current theme. */
export function Illustration({
  name,
  width = 200,
  label,
}: {
  name: IllustrationName;
  width?: number;
  label?: string;
}) {
  const t = useTheme();
  const spec: IllustrationSpec = illustrations[name];
  const colors = ILLUSTRATION_PALETTE[t.dark ? 'dark' : 'light'];

  return (
    <Svg
      width={width}
      height={(width * ILLUSTRATION_H) / ILLUSTRATION_W}
      viewBox={`0 0 ${ILLUSTRATION_W} ${ILLUSTRATION_H}`}
      accessibilityLabel={label ?? spec.alt}
    >
      {spec.shapes.map((s, i) => {
        if (s.t === 'circle') {
          return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={colors[s.fill]} />;
        }
        if (s.t === 'rect') {
          return (
            <Rect
              key={i}
              x={s.x}
              y={s.y}
              width={s.w}
              height={s.h}
              rx={s.rx ?? 0}
              fill={colors[s.fill]}
            />
          );
        }
        return (
          <Path
            key={i}
            d={s.d}
            fill={s.fill ? colors[s.fill] : 'none'}
            stroke={s.stroke ? colors[s.stroke] : undefined}
            strokeWidth={s.sw ?? 4}
            strokeLinecap="round"
          />
        );
      })}
    </Svg>
  );
}
