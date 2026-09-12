'use client';

import type { ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dumbbell, MessageSquare, Settings, Sparkles, Trophy, Users } from 'lucide-react';
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
  { href: '/settings', label: 'Settings', Icon: Settings },
];

/**
 * The portal's navigation: a sidebar where there is room, a top bar where there is not.
 *
 * A physiotherapist reads a client's page on her phone between appointments. A fixed
 * 240px sidebar there left the content a third of the screen, one word per line. Below
 * the `md` breakpoint the same items run in a scrollable row under the brand, and the
 * page takes the width.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <nav
        className="md:hidden sticky top-0 z-20 border-b"
        style={{ background: 'var(--surface)' }}
        aria-label="Main"
      >
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-2">
          <VelaBadge size={26} radius={8} />
          <span className="display-face text-base font-extrabold tracking-tight">Vela</span>
        </div>
        <ul className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm whitespace-nowrap"
                  style={{
                    background: active ? palette.brand[50] : 'transparent',
                    color: active ? palette.brand[800] : 'var(--ink-secondary)',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {item.vela ? (
                    <VelaIcon name={item.vela} size={15} strokeWidth={active ? 2.4 : 2} />
                  ) : item.Icon ? (
                    <item.Icon size={15} strokeWidth={active ? 2.4 : 2} />
                  ) : null}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav
        className="hidden w-60 shrink-0 flex-col justify-between border-r p-4 md:flex"
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
    </>
  );
}
