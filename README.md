# Desk

A pane in the sidebar where you can put notes temporarily while you are writing in your current note of focus.

## Development

This project follows the conventions described in [AGENTS.md](AGENTS.md) — read that first.

- Node.js 18+ and npm.
- `npm install` — install dependencies.
- `npm run dev` — build in watch mode.
- `npm run build` — type-check and produce a production `main.js`.
- `npm run lint` — lint with `eslint-plugin-obsidianmd`'s recommended rules.

### Testing in Obsidian

Copy or symlink this repo into `<Vault>/.obsidian/plugins/desk/`, then enable **Desk** under
**Settings → Community plugins** in that vault.

If your Obsidian install is sandboxed (Flatpak, Snap), a symlink outside the sandbox's exposed
filesystem may not resolve. For Flatpak, check `flatpak info --show-permissions md.obsidian.Obsidian`
for its `filesystems=` entry, and either widen it
(`flatpak override --user --filesystem=home md.obsidian.Obsidian`) or copy the built files into
the vault instead of symlinking.

## Releasing

See the "Versioning & releases" section in [AGENTS.md](AGENTS.md).
