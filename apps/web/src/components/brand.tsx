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

/**
 * The Vela mark. Geometry comes from packages/shared so the portal, the app and the
 * generated App Store icon are the same two shapes.
 */
export function VelaMark({
  size = 24,
  mode = 'onLight',
  className,
}: {
  size?: number;
  mode?: BrandFillMode;
  className?: string;
}) {
  const fills = BRAND_FILLS[mode];
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${BRAND_VIEWBOX} ${BRAND_VIEWBOX}`}
      className={className}
      role="img"
      aria-label="Vela"
    >
      <path d={SAIL_JIB} fill={fills.jib} />
      <path d={SAIL_MAIN} fill={fills.main} />
    </svg>
  );
}

/** The reversed mark on its coral ground — nav brand slot, favicon, avatars. */
export function VelaBadge({ size = 32, radius = 9 }: { size?: number; radius?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, borderRadius: radius, background: BRAND_GROUND }}
    >
      <VelaMark size={size * 0.62} mode="onBrand" />
    </span>
  );
}

/**
 * One of Vela's own icons.
 *
 * Deliberately the same props shape as a Lucide icon (`size`, `strokeWidth`, colour via
 * `currentColor`) so the two sets are interchangeable at a call site and nobody has to
 * remember which library a given glyph came from.
 */
export function VelaIcon({
  name,
  size = 24,
  strokeWidth = 2,
  className,
  ...rest
}: {
  name: VelaIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
} & Omit<React.SVGProps<SVGSVGElement>, 'name' | 'width' | 'height'>) {
  const spec: VelaIconSpec = velaIcons[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VELA_ICON_VIEWBOX} ${VELA_ICON_VIEWBOX}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...rest}
    >
      {spec.paths.map((d) => (
        <path key={d} d={d} />
      ))}
      {spec.circles?.map((c) => (
        <circle
          key={`${c.cx}-${c.cy}-${c.r}`}
          cx={c.cx}
          cy={c.cy}
          r={c.r}
          fill={c.fill ? 'currentColor' : 'none'}
          stroke={c.fill ? 'none' : 'currentColor'}
        />
      ))}
    </svg>
  );
}
