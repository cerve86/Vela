'use client';

import type { ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dumbbell, MessageSquare, Sparkles, Trophy, Users } from 'lucide-react';
import type { VelaIconName } from '@vela/shared';
import { palette } from '@vela/shared/tokens';
import { SignedInAs } from './SignedInAs';
import { VelaBadge, VelaIcon } from './brand';

interface NavItem {
  href: string;
  label: string;
  /** A Lucide component, for concepts Lucide already says well. */
  Icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
  /** One of Vela's own glyphs, for the concepts it doesn't. */
  vela?: VelaIconName;
}

const NAV: NavItem[] = [
  { href: '/clients', label: 'Clients', Icon: Users },
  { href: '/programs', label: 'Programmes', vela: 'program-block' },
  { href: '/challenges', label: 'Challenges', Icon: Trophy },
  { href: '/library', label: 'Exercise library', Icon: Dumbbell },
  { href: '/messages', label: 'Messages', Icon: MessageSquare },
  { href: '/preview', label: 'Design preview', Icon: Sparkles },
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
          <VelaBadge size={30} radius={9} />
          <span className="display-face text-base font-extrabold tracking-tight">Vela</span>
        </div>

        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            const stroke = active ? 2.4 : 2;
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
                  {item.vela ? (
                    <VelaIcon name={item.vela} size={17} strokeWidth={stroke} />
                  ) : item.Icon ? (
                    <item.Icon size={17} strokeWidth={stroke} />
                  ) : null}
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
