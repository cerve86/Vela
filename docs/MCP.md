# Claude and Vela: the MCP server

`packages/mcp` is a small [MCP](https://modelcontextprotocol.io) server that lets Claude
work inside a coach's Vela account: read her exercise library, check a programme draft
against it, and create the programme. It is how a physiotherapist who plans in Claude
gets the plan into Vela without retyping it.

It never assigns a programme to a client. Claude drafts; the coach assigns, with a start
date, in the portal. That boundary is deliberate and this server has no tool that crosses
it.

## Setting it up — for the coach

1. **Make a key.** In the portal open **Settings → API keys**, name the key after what
   will use it ("Claude on my laptop"), and copy it. It is shown once; if it is lost,
   revoke it and make another.
2. **Install the extension.** Open `vela.mcpb` — double-click it, or in Claude Desktop go
   to Settings → Extensions → Advanced settings → Install extension… and choose the file.
   Claude Desktop asks for the API key; paste it. Nothing else to configure.
3. **Use it.** Start a chat and ask for a programme:

   > Draft a 4-week early postnatal progression, three days a week: pelvic floor and
   > breath work first, then hinge and bridge patterns, building to single-leg work.

   Claude reads the library, drafts, shows a preview and asks before creating. The
   programme then appears under **Programmes** in the portal, unassigned, ready to open
   in the builder and assign.

If a movement Claude wants is not in the library it will say so rather than substitute.
Add it under **Exercise library** and ask again.

To stop a key working, revoke it in Settings. It stops on the next call.

### Claude Code, or a hand-written Claude Desktop config

The same server runs anywhere that can start a Node process:

```bash
claude mcp add vela -e VELA_API_KEY=vela_… -- node /path/to/packages/mcp/dist/vela-mcp.cjs
```

or, in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vela": {
      "command": "node",
      "args": ["/path/to/packages/mcp/dist/vela-mcp.cjs"],
      "env": { "VELA_API_KEY": "vela_…" }
    }
  }
}
```

`VELA_URL` overrides the portal address (default `https://www.vela-coaching.com`); set it
to `http://localhost:4310` against a local stack.

## The tools

| Tool              | What it does                                                                  |
| ----------------- | ----------------------------------------------------------------------------- |
| `whoami`          | The coach the key acts as. The first call to make when something is off.      |
| `list_exercises`  | The library — shipped plus her own — optionally filtered by name or category. |
| `list_programs`   | Her programmes and templates, with ids and portal links.                      |
| `get_program`     | One programme in full, as days of prescriptions.                              |
| `preview_program` | Validates a draft and matches every exercise name. Creates nothing.           |
| `create_program`  | Creates the programme and returns its link. Never assigns.                    |

The programme shape is the one in [IMPORT.md](IMPORT.md): the server publishes the
import schema, field by field, as the tool's input, so a draft that passes here is exactly
a draft the upload form would accept. The server's instructions to Claude say to read the
library first, preview before creating, and be exact with sets, reps, load and rest.

## How it works

The server is a thin client of the portal's HTTP API. Every rule about what a programme
may contain lives on the server side — the same code the spreadsheet upload runs — so the
MCP server validates nothing itself and cannot drift from the portal.

A personal API key is the credential. On the way in the portal hashes it, finds the row,
and mints a session for the coach who owns it (an admin-generated magic-link token,
verified server-side, no email sent). From there the request is her session: every query
runs through row level security as her, and the API needs no permission logic of its own.
Only the hash is stored, so a leaked database row is not a leaked key. The row is checked
on every request, which is why revoking takes effect immediately.

A key is only useful against the portal's `/api` routes. It is not a Supabase token and
cannot query the database directly.

## Building the bundle

```bash
npm run mcp:pack
```

produces `packages/mcp/dist/vela.mcpb` — the manifest, the server bundled into one file,
and an icon. The server is bundled with esbuild so the extension has no `node_modules`;
Claude Desktop supplies the Node runtime.

`npm test -w @vela/mcp` runs the server in-process against a scripted portal and checks
every tool's wording, including the refusals.

## What is deliberately not here

- **No assignment**, as above.
- **No exercise creation.** An unmatched name is refused, never invented.
- **No deleting or editing.** A programme Claude created and the coach dislikes is deleted
  in the portal, by her.
- **No client data.** The API exposes the library and programmes. Nothing about a client
  is reachable with a key.
- **No remote server.** This runs on the coach's own machine, which is where the key
  stays. A hosted version for claude.ai in the browser would need OAuth in front of it,
  and is a separate piece of work.
