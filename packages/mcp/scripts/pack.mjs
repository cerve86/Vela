// Builds the Claude Desktop bundle: manifest + the single-file server + an icon, zipped
// as dist/vela.mcpb. Staged into its own directory so the bundle holds exactly those three
// files and nothing from the workspace around them.
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, '..');
const stage = join(pkg, 'dist', 'bundle');
const out = join(pkg, 'dist', 'vela.mcpb');

const server = join(pkg, 'dist', 'vela-mcp.cjs');
if (!existsSync(server)) throw new Error('Build first: npm run build -w @vela/mcp');

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(join(pkg, 'manifest.json'), join(stage, 'manifest.json'));
cpSync(server, join(stage, 'vela-mcp.cjs'));
cpSync(
  join(pkg, '..', '..', 'apps', 'mobile', 'assets', 'images', 'icon.png'),
  join(stage, 'icon.png'),
);

const mcpb = join(pkg, '..', '..', 'node_modules', '.bin', 'mcpb');
execFileSync(mcpb, ['validate', join(stage, 'manifest.json')], { stdio: 'inherit' });
execFileSync(mcpb, ['pack', stage, out], { stdio: 'inherit' });
console.log(`\nBundle: ${out}`);
