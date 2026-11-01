/**
 * GET /companion/js/config.js — the companion's Supabase settings, from this deployment.
 *
 * The companion (apps/companion) is a static site with no build step, and its design kept
 * these two values in a gitignored file — which a static deploy then simply never has.
 * Serving them from here instead means they always match the backend the portal itself
 * uses, and there is nothing to fill in by hand. Both are public values: the anon key
 * ships inside every client, and row level security is what protects the data.
 */
export function GET() {
  const config = {
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  };
  return new Response(`window.VELA_CONFIG = ${JSON.stringify(config)};\n`, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
