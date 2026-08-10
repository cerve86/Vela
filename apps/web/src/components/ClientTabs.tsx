'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { palette } from '@coachapp/shared/tokens';

const TABS = [
  { seg: '', label: 'Overview' },
  { seg: 'training', label: 'Training' },
  { seg: 'nutrition', label: 'Nutrition' },
  { seg: 'vitals', label: 'Vitals' },
];

export function ClientTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const base = `/clients/${clientId}`;

  return (
    <nav className="flex gap-1 border-b" aria-label="Client sections">
      {TABS.map((t) => {
        const href = t.seg ? `${base}/${t.seg}` : base;
        const active = pathname === href;
        return (
          <Link
            key={t.seg}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="relative px-3 py-2 text-sm transition-colors"
            style={{
              color: active ? palette.brand[800] : 'var(--ink-secondary)',
              fontWeight: active ? 600 : 400,
            }}
          >
            {t.label}
            {active && (
              <span
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                style={{ background: palette.brand[700] }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
