'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { palette } from '@vela/shared/tokens';
import { SignedInAs } from './SignedInAs';

const NAV = [
  { href: '/clients', label: 'Clients', glyph: '◫' },
  { href: '/programs', label: 'Programs', glyph: '◳' },
  { href: '/library', label: 'Exercise library', glyph: '☰' },
  { href: '/messages', label: 'Messages', glyph: '✉' },
  { href: '/preview', label: 'Design preview', glyph: '◈' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      className="flex w-60 shrink-0 flex-col justify-between border-r p-4"
      style={{ background: 'var(--surface)' }}
      aria-label="Main"
    >
      <div>
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ background: palette.brand[700] }}
            aria-hidden
          >
            C
          </span>
          <span className="text-sm font-semibold">Vela</span>
        </div>

        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors"
                  style={{
                    background: active ? palette.brand[50] : 'transparent',
                    color: active ? palette.brand[800] : 'var(--ink-secondary)',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <span aria-hidden className="w-4 text-center opacity-70">
                    {item.glyph}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t pt-3">
        <SignedInAs />
      </div>
    </nav>
  );
}
