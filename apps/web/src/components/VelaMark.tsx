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
  /** Rendered size in px. The mark is vector; this is the box it fills. */
  size?: number;
  /** Corner radius in viewBox units. 12 ≈ Tailwind's rounded-lg at 32px, 16 ≈ rounded-xl. */
  radius?: number;
  className?: string;
};

/**
 * The mark on its coral tile, sails knocked out in cream. This is the lockup for nav
 * slots, avatars and the favicon — never the identity coral on the interactive coral.
 */
export function VelaMark({ size = 32, radius = 12, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role="img"
      aria-label="Vela"
    >
      <rect width="48" height="48" rx={radius} fill={palette.brand[600]} />
      <g transform="translate(1.8 3.5) scale(0.845)">
        <path d={MAINSAIL} fill={palette.chrome.light.page} />
        <path d={JIB} fill={palette.brand[200]} />
      </g>
    </svg>
  );
}

/** The bare sails, no tile — for cream grounds where a coral chip would be too loud. */
export function VelaSail({ size = 24, className }: Omit<Props, 'radius'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role="img"
      aria-label="Vela"
    >
      <path d={MAINSAIL} fill={palette.brand[600]} />
      <path d={JIB} fill={palette.brand[400]} />
    </svg>
  );
}
