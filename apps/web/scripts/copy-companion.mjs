/**
 * Copies the companion site (apps/companion) into public/companion, where Next serves it
 * at /companion/. Runs before `dev` and `build`.
 *
 * The companion stays a plain static site in its own folder — its author edits it there,
 * with no React or build tooling in the way — and the portal is only its host. The copy
 * takes the site and nothing else: the docs (strategy notes, the original schema) and the
 * prompt packs are kept out of a public folder on purpose.
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(web, '..', 'companion');
const out = join(web, 'public', 'companion');

if (!existsSync(src)) {
  console.error(`[companion] ${src} not found`);
  process.exit(1);
}

// The HRV decision tree is the Vela app's own (packages/shared/src/hrvGuidance.ts), so the
// companion, the app and the coach's portal read her week the same way. The companion has
// no bundler, so the module is transpiled into one plain script that sets a global,
// VelaHrv, and written into the companion's own folder (committed, so the site also runs
// on its own); every dev and build run regenerates it, so it cannot drift from the source.
const treeTs = join(web, '..', '..', 'packages', 'shared', 'src', 'hrvGuidance.ts');
const { outputText } = ts.transpileModule(readFileSync(treeTs, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.ESNext },
});
const exported = [...outputText.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]);
const body = outputText
  .replace(/^export (?=(?:function|const) )/gm, '')
  .replace(/^export \{\s*\};?\s*$/gm, '')
  .trimEnd()
  .replace(/^(?=.)/gm, '  ');
writeFileSync(
  join(src, 'js', 'hrv-guidance.js'),
  `// GENERATED from packages/shared/src/hrvGuidance.ts by apps/web/scripts/copy-companion.mjs.\n` +
    `// Do not edit: change the source, then run the script (npm run dev and build run it).\n` +
    `const VelaHrv = (() => {\n${body}\n  return { ${exported.join(', ')} };\n})();\n`,
);

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
