# Obsidian for Claude

Connect Claude to your local Obsidian vault. Ask Claude to list, read, search and (optionally) edit your notes, all running on your own computer.

This extension talks to your vault through the community plugin **Local REST API** by coddingtonbear. That plugin is what exposes your vault locally; this extension connects Claude to it. Nothing leaves your machine.

## What you need

- [Obsidian](https://obsidian.md)
- The **Local REST API** community plugin, installed and enabled (steps below)
- Claude Desktop

## Setup (about 3 minutes)

### 1. Install the Local REST API plugin in Obsidian
1. In Obsidian, open **Settings > Community plugins**.
2. Click **Browse**, search for **"Local REST API"** (by coddingtonbear), then **Install** and **Enable** it.
3. Open the plugin's settings and **copy the API key** shown there. Keep it handy for the next step.

### 2. Install this extension in Claude Desktop
1. Download the `obsidian.mcpb` file.
2. In Claude Desktop, open **Settings > Extensions**.
3. Under **Advanced settings**, click **Install Extension** and select the downloaded file (you can also drag the file into that window).
4. When prompted, **paste the API key** from step 1. It is stored securely in your operating system's keychain, never in a plain text file.
5. Choose your permissions (see below), then enable the extension.

### 3. Try it
Open a chat and ask, for example: *"List the notes in my Obsidian vault"* or *"Summarize my daily note."*

## Permissions

To keep you in control, the extension has three levels, set in its settings:

- **Read** (always on) — list, read, and search your notes.
- **Allow creating and editing notes** (on by default) — let Claude add to and modify notes.
- **Allow deleting notes** (off by default) — let Claude delete notes. This is destructive; leave it off unless you need it.

Turn editing or deleting off at any time to make the extension effectively read-only.

## Privacy Policy

This extension does not collect, transmit, or store any of your data on any external server.

- All communication happens **locally on your computer**, between Claude Desktop and Obsidian over `127.0.0.1` (localhost). Your notes never leave your machine through this extension.
- Your Obsidian API key is stored in your operating system's **secure keychain** (macOS Keychain / Windows Credential Manager), not in a plain text file.
- The extension contains **no analytics and no telemetry**.
- The only network connection it makes is to your own Obsidian instance on localhost, through the Local REST API plugin.

The extension depends on the Local REST API plugin, which runs its own local server on your machine; refer to that plugin's documentation for its behavior.

## Security notes

- Traffic to Obsidian uses HTTPS on localhost. The Local REST API plugin uses a self-signed certificate; because the connection never leaves your machine (`127.0.0.1`), certificate verification is not enforced for this local link.
- The API key grants access to your vault. Keep it private. You can regenerate it at any time in the plugin's settings, then update it in this extension's settings.

## Troubleshooting

- **"Could not reach Obsidian"** — make sure Obsidian is running and the Local REST API plugin is enabled.
- **Authentication errors** — re-check the API key in the extension settings against the plugin's settings.

## Credits

- **Local REST API** plugin by coddingtonbear — https://github.com/coddingtonbear/obsidian-local-rest-api
- **Obsidian** — https://obsidian.md (name and logo used with permission)

## License

MIT. See [LICENSE](LICENSE).

## Development

This extension is open source. The runtime is a single bundled file built from `src/index.js`.

```bash
npm install          # install the MCP SDK + esbuild
npm run build        # bundle src/index.js -> server/index.mjs
npm run pack         # build, then create obsidian.mcpb
```

- `src/index.js` — the full, readable server source.
- `server/index.mjs` — generated build artifact (git-ignored).
- `obsidian.mcpb` — the packaged extension (git-ignored); attach it to a GitHub release.
