# Desk

A pane in the sidebar where you can put notes temporarily while you are writing in your current note of focus.

## Usage

Open the pane with the ribbon icon or the **Desk: Open pane** command, then:

- **Move a tab onto the desk** — drag a note's tab from the editor area into the pane. The tab
  closes and the note joins the list where you drop it. Dropping onto the sidebar's tab icons still
  docks the tab in the sidebar, as usual.
- **Move a note back into the editor** — drag a note out of the pane into the editor area. It opens
  as its own tab in the tab group you drop it on, and leaves the desk.
- **Add a note without closing anything** — drag it from the File Explorer, drag link text into the
  pane, or run **Desk: Add current note**.
- **Reorder** — drag a note's title row up or down within the pane.
- **Remove** — right-click a note and select **Remove from desk**.
- **Fold and unfold** — select the arrow next to a note to collapse it to its title, or expand it
  to read a preview. Select the title itself to open the note.

The list and its fold states persist across restarts.

### Known limitations

- Drag and drop needs a mouse or trackpad, so it does nothing on touch screens. The commands and
  the right-click menu (**Move up**, **Move down**, **Remove from desk**) cover the same ground.
- Moving tabs onto the desk relies on parts of Obsidian that aren't part of its plugin API, so an
  Obsidian update could break it until Desk is updated. When that happens, tabs dropped on the pane
  dock in the sidebar again; everything else keeps working.
- Only Markdown notes can be put on the desk.
- Previews are read-only, and are rendered when a note is unfolded — edit the note by opening it.

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
