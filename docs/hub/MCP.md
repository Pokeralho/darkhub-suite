# Claude inside DarkHub (MCP)

DarkHub Suite can run an [MCP](https://modelcontextprotocol.io) server so Claude (Claude Code, Claude Desktop or any MCP
client) can read this PC's hardware, write and check packages, and install them, always with your approval.

## Turn it on

DarkHub → **Presets e módulos** → **IA (MCP)** → **Ativar o servidor MCP**. It is off by default.

- It listens only on `127.0.0.1:47615` (another port is used if you edit `mcp.json`); nothing on your network can reach it.
- Every request needs the token stored in `mcp.json` in DarkHub's data folder (`%APPDATA%\DarkHub\mcp.json`). **Gerar
  novo token** replaces it.
- Requests from web pages are refused (no browser `Origin`, loopback `Host` only).
- **Every install, removal and update opens a window in DarkHub** showing exactly what will change. Nothing changes until
  you click **Aprovar**; if you decline, or do not answer within 5 minutes, Claude gets "not approved".

## Claude Code

The tab shows this command with your token filled in (button **Copiar**):

```bash
claude mcp add --transport http darkhub http://127.0.0.1:47615/mcp --header "Authorization: Bearer <token>"
```

## Claude Desktop

Claude Desktop talks to local servers over stdio, so DarkHub ships a small bridge, `DarkHub.Mcp.exe`. The tab shows the
block to paste into `claude_desktop_config.json` (Claude Desktop → Settings → Developer → Edit config), with the real
paths of your installation:

```json
{
  "mcpServers": {
    "darkhub": {
      "command": "C:\\Program Files\\DarkHub\\resources\\app.asar.unpacked\\electron\\services\\DarkHub.Mcp.exe",
      "args": ["--config", "C:\\Users\\<you>\\AppData\\Roaming\\DarkHub\\mcp.json"]
    }
  }
}
```

Restart Claude Desktop. The bridge reads `mcp.json` on every message, so turning the server on later or changing the
token needs no restart. When DarkHub is closed, Claude gets "DarkHub is not open".

## Tools

| Tool | What it does | Changes the PC |
|---|---|---|
| `darkhub_hardware` | Windows build, CPU/GPU vendors, dedicated GPU, laptop/desktop, RAM, Ethernet, DarkOS | no |
| `darkhub_builtins` | Built-in tweaks and operations, risk, whether community packages may use them | no |
| `darkhub_schema` | The package JSON Schema | no |
| `darkhub_validate` | Same checks as the app and the Hub, with a description of every item | no |
| `darkhub_inspect` | Dry run on this PC: today's value, value after, already matching | no |
| `darkhub_install` | Installs a package (after your approval) | yes |
| `darkhub_installed` | Installed packages | no |
| `darkhub_uninstall` | Removes a package, restoring every value (after your approval) | yes |
| `darkhub_export_my_pc` | A preset with the tweaks and operations active on this PC | no |
| `hub_search` | Searches hub.darkhub.ink; says which results fit this PC | no |
| `hub_package` | Details of a Hub package | no |
| `hub_install` | Downloads (hash and signature checked) and installs a Hub package (after your approval) | yes |
| `hub_updates` | Installed Hub packages with a newer version | no |
| `hub_update` | Updates a Hub package (after your approval) | yes |
| `darkhub_extension_dev_load` | Loads an extension from a folder and reloads it on every change (after your approval) | no (adds a screen) |
| `darkhub_extension_reload` | Rebuilds a development extension | no |
| `darkhub_extension_logs` | The extension's console and errors | no |

## Example prompts

> Look at my PC with DarkHub and suggest a preset for competitive shooters. Validate it, show me the preview and
> install it if everything is low or medium risk.

> Search the DarkHub Hub for privacy presets that fit this PC and explain the differences.

> Turn what I have active in DarkHub into a preset called "Meu setup", author pokeralho, and save it as a file.

## For developers

Transport: MCP Streamable HTTP with JSON responses (no SSE stream), protocol versions 2025-06-18, 2025-03-26 and
2024-11-05. Code: [HubMcp.js](../../electron/services/hub/HubMcp.js), bridge
[DarkHub.Mcp.cs](../../electron/services/DarkHub.Mcp.cs) (built by `npm run build:native`), tests in
[tests/hubMcp.test.ts](../../tests/hubMcp.test.ts).
