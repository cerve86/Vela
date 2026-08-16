import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

/**
 * Fail a production build that has no Supabase configuration.
 *
 * `NEXT_PUBLIC_*` values are inlined into the bundle at build time, not read at runtime,
 * which makes a missing variable uniquely confusing on Vercel: adding it to the project
 * settings does nothing until a *fresh* build runs, and a redeploy that reuses the build
 * cache keeps shipping the old empty value. The deploy is green, the site is broken, and
 * nothing in the log says why.
 *
 * The check lives here rather than in a `prebuild` script because Next has already loaded
 * `.env.local` and friends by the time config is evaluated, so local builds keep working
 * without duplicating dotenv resolution.
 */
export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    const missing = (
      ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const
    ).filter((key) => !process.env[key]);

    if (missing.length) {
      throw new Error(
        [
          '',
          `Refusing to build: ${missing.join(' and ')} not set.`,
          '',
          'These are inlined into the bundle at build time, so a deployment built without',
          'them stays broken even after the values are added. On Vercel: set them for the',
          'Production environment, then redeploy with "Use existing Build Cache" OFF.',
          '',
          'Both are public values — the anon key ships inside the client either way, and',
          'row level security is what protects the data.',
          '',
        ].join('\n'),
      );
    }
  }

  return {
    // The shared package ships raw TypeScript so mobile and web consume one source of
    // truth without a build step in between.
    transpilePackages: ['@vela/shared'],
  };
}
