import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { VelaApi, configFromEnv } from './api.ts';
import { buildServer } from './server.ts';

/**
 * Entry point: Claude Desktop (or Claude Code) starts this as a child process and speaks
 * MCP over stdin/stdout. Nothing may be written to stdout except protocol messages, so
 * every human-facing word here goes to stderr.
 */
async function main() {
  let api: VelaApi;
  try {
    api = new VelaApi(configFromEnv(process.env));
  } catch (e) {
    process.stderr.write(`vela-mcp: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }

  const server = buildServer(api);
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  process.stderr.write(`vela-mcp: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(1);
});
