'use client';

import { useEffect, useState } from 'react';
import {
  ILLUSTRATION_H,
  ILLUSTRATION_PALETTE,
  ILLUSTRATION_W,
  illustrations,
  type Illustration as IllustrationSpec,
  type IllustrationName,
} from '@vela/shared';

/**
 * Resolves the theme the artwork has to sit on.
 *
 * The portal supports three states, not two: an explicit `data-theme` on the root, or
 * nothing at all, in which case the OS decides. Reading only the attribute would leave
 * every illustration in its light palette for the majority of viewers, who never set one.
 */
function useIsDark(): boolean {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const resolve = () => {
      const explicit = document.documentElement.getAttribute('data-theme');
      setDark(explicit ? explicit === 'dark' : media.matches);
    };
    resolve();

    media.addEventListener('change', resolve);
    const observer = new MutationObserver(resolve);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      media.removeEventListener('change', resolve);
      observer.disconnect();
    };
  }, []);

  return dark;
}

export function Illustration({
  name,
  width = 200,
  alt,
  className,
}: {
  name: IllustrationName;
  width?: number;
  alt?: string;
  className?: string;
}) {
  const dark = useIsDark();
  const spec: IllustrationSpec = illustrations[name];
  const colors = ILLUSTRATION_PALETTE[dark ? 'dark' : 'light'];
  const label = alt ?? spec.alt;

  return (
    <svg
      width={width}
      height={(width * ILLUSTRATION_H) / ILLUSTRATION_W}
      viewBox={`0 0 ${ILLUSTRATION_W} ${ILLUSTRATION_H}`}
      className={className}
      role="img"
      aria-label={label}
    >
      {spec.shapes.map((s, i) => {
        if (s.t === 'circle') {
          return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={colors[s.fill]} />;
        }
        if (s.t === 'rect') {
          return (
            <rect
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
          <path
            key={i}
            d={s.d}
            fill={s.fill ? colors[s.fill] : 'none'}
            stroke={s.stroke ? colors[s.stroke] : undefined}
            strokeWidth={s.sw ?? 4}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
