#!/usr/bin/env node
/**
 * Refuses to build a distributable app that points at a developer's laptop.
 *
 * `EXPO_PUBLIC_*` values are frozen into the JS bundle at build time. A build made with
 * the local defaults still compiles, uploads and installs perfectly — it just fails every
 * request once a tester opens it, which surfaces as "the app is broken" three days later
 * rather than as a build error in thirty seconds.
 *
 * Runs as EAS's `eas-build-pre-install` hook, so it fires on the build server where the
 * mistake actually matters, and stays out of the way locally.
 */

const profile = process.env.EAS_BUILD_PROFILE ?? '';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// `development` builds are expected to talk to a local stack — that is the whole point.
const DISTRIBUTED = ['preview', 'production'];
if (!DISTRIBUTED.includes(profile)) {
  console.log(`[vela] profile "${profile || 'none'}" — skipping release env check`);
  process.exit(0);
}

const problems = [];
if (!url) problems.push('EXPO_PUBLIC_SUPABASE_URL is not set');
else if (/127\.0\.0\.1|localhost|10\.0\.2\.2|::1/.test(url)) {
  problems.push(`EXPO_PUBLIC_SUPABASE_URL points at a local address (${url})`);
}
if (!anonKey) problems.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is not set');
else if (anonKey.includes('supabase-demo')) {
  // The local stack's key is identical on every machine and signed by a throwaway secret.
  problems.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is the well-known local development key');
}

if (problems.length) {
  console.error(`\n[vela] Refusing to build profile "${profile}":\n`);
  for (const p of problems) console.error(`  · ${p}`);
  console.error(
    [
      '',
      'Set these on the build, not in .env — that file is local-only and is not uploaded:',
      '',
      '  eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co',
      '  eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key>',
      '',
      'The anon key is safe to expose — it ships inside the app and every table it reaches',
      'is guarded by row level security. The service role key must never go in a build.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

console.log(`[vela] release env OK for "${profile}" → ${url}`);
