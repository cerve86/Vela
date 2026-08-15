/**
 * Vela's own icons — the concepts Lucide has no word for.
 *
 * Drawn on the Lucide grid (24px box, 2px round strokes, single colour) so they sit
 * beside the Lucide icons the app already ships without reading as a second set.
 * Anything Lucide already does well is deliberately not duplicated here.
 *
 * Source of truth is design/icons/*.svg — edit there, not here.
 */

export type VelaIconProps = {
  size?: number;
  strokeWidth?: number;
  className?: string;
};

/** Vela's own glyph — splash, empty states, the brand slot in a nav. */
export function Sail({ size = 24, strokeWidth = 2, className }: VelaIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 3c4.4 4.9 7.3 11 8.4 18H12Z"/>
      <path d="M2.5 21h19"/>
    </svg>
  );
}

/** Streak and adherence: the sail plus the water already covered. */
export function Wake({ size = 24, strokeWidth = 2, className }: VelaIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M13 2.5c3.9 4.4 6.4 9.8 7.4 15.8H13Z"/>
      <path d="M3 21.5h18"/>
      <path d="M3.5 17.5h6"/>
      <path d="M6.5 13.5h3"/>
    </svg>
  );
}

/** The morning readiness check, drawn as a wind gauge rather than a medical dial. */
export function Readiness({ size = 24, strokeWidth = 2, className }: VelaIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3.5 18.5a8.5 8.5 0 1 1 17 0"/>
      <path d="M12 18.5 16.6 11.9"/>
      <circle cx="12" cy="18.5" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  );
}

/** A joint on a limb — where it hurts, without a body diagram. */
export function PainPoint({ size = 24, strokeWidth = 2, className }: VelaIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4.6 19.4 9.4 14.6"/>
      <path d="m14.6 9.4 4.8-4.8"/>
      <circle cx="12" cy="12" r="3.4"/>
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  );
}

/** Angle at a pivot: the measurement a physio actually records. */
export function RangeOfMotion({ size = 24, strokeWidth = 2, className }: VelaIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4.5 19.5h15"/>
      <path d="M4.5 19.5 16 8"/>
      <path d="M13.5 19.5A9 9 0 0 0 10.9 13.1"/>
      <circle cx="4.5" cy="19.5" r="1.4" fill="currentColor" stroke="none"/>
    </svg>
  );
}

/** Sets and reps as a bracketed group. */
export function SetsReps({ size = 24, strokeWidth = 2, className }: VelaIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h2"/>
      <path d="M18 3h2a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-2"/>
      <path d="M8 8h8"/>
      <path d="M8 12h8"/>
      <path d="M8 16h5"/>
    </svg>
  );
}

/** Metronome — the tempo prescription on an exercise. */
export function Tempo({ size = 24, strokeWidth = 2, className }: VelaIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M13.8 3h-3.6L5 21h14Z"/>
      <path d="m12 21 3.8-13.5"/>
    </svg>
  );
}

/** A training block: progression inside a bounded period. */
export function ProgramBlock({ size = 24, strokeWidth = 2, className }: VelaIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="2.5" y="3.5" width="19" height="17" rx="3.5"/>
      <path d="M8 16.5v-3"/>
      <path d="M12 16.5v-6"/>
      <path d="M16 16.5v-9"/>
    </svg>
  );
}

/** Progress that wanders and still rises. */
export function TrendWave({ size = 24, strokeWidth = 2, className }: VelaIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 17c2.6 0 3.4-3.6 6-3.6s3.4 3.6 6 3.6 3.4-7.6 6-7.6"/>
      <circle cx="21" cy="9.4" r="1.4" fill="currentColor" stroke="none"/>
    </svg>
  );
}
