/**
 * Copies the companion site (apps/companion) into public/companion, where Next serves it
 * at /companion/. Runs before `dev` and `build`.
 *
 * The companion stays a plain static site in its own folder — its author edits it there,
 * with no React or build tooling in the way — and the portal is only its host. The copy
 * takes the site and nothing else: the docs (strategy notes, the original schema) and the
 * prompt packs are kept out of a public folder on purpose.
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(web, '..', 'companion');
const out = join(web, 'public', 'companion');

if (!existsSync(src)) {
  console.error(`[companion] ${src} not found`);
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
cpSync(src, out, {
  recursive: true,
  filter: (path) => {
    const rel = relative(src, path);
    if (rel === '') return true;
    if (rel === 'docs' || rel.startsWith('docs' + sep)) return false;
    // js/config.js is served by a route (src/app/companion/js/config.js); a file of the
    // same name here would collide with it.
    if (rel === join('js', 'config.js')) return false;
    return !/\.md$/i.test(rel) && !rel.endsWith('.DS_Store');
  },
});
console.log('[companion] copied to public/companion');
