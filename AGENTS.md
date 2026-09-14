# Obsidian community plugin — Desk Sidebar

## Project overview

- Target: Obsidian Community Plugin (TypeScript → bundled JavaScript).
- Entry point: `src/main.ts` compiled to `main.js` and loaded by Obsidian.
- Required release artifacts: `main.js`, `manifest.json`, and optional `styles.css`.

## Environment & tooling

- Node.js: use current LTS (Node 18+ recommended).
- **Package manager: npm** (`package.json` defines npm scripts and dependencies — don't switch to
  yarn/pnpm).
- **Bundler: esbuild** (`esbuild.config.mjs` and build scripts depend on it).
- Types: `obsidian` type definitions.

### Install

```bash
npm install
```

### Dev (watch)

```bash
npm run dev
```

### Production build

```bash
npm run build
```

## Linting

- ESLint is preconfigured with `eslint-plugin-obsidianmd` for Obsidian-specific rules.
- Run `npm run lint` to lint the project.
- A GitHub Action automatically lints every commit on all branches.

## File & folder conventions

- **Organize code into multiple files**: split functionality across separate modules rather than
  putting everything in `main.ts`.
- Source lives in `src/`. Keep `main.ts` small and focused on plugin lifecycle (loading, unloading,
  registering commands).
- **Example file structure**:
    ```
    src/
      main.ts           # Plugin entry point, lifecycle management
      settings.ts       # Settings interface and defaults
      commands/         # Command implementations
        command1.ts
        command2.ts
      ui/              # UI components, modals, views
        modal.ts
        view.ts
      utils/           # Utility functions, helpers
        helpers.ts
        constants.ts
      types.ts         # TypeScript interfaces and types
    ```
- **Do not commit build artifacts**: never commit `node_modules/`, `main.js`, or other generated
  files to version control.
- Keep the plugin small. Avoid large dependencies. Prefer browser-compatible packages.
- Release artifacts must end up at the top level of the plugin folder in the vault (`main.js`,
  `manifest.json`, `styles.css`).

## Manifest rules (`manifest.json`)

- Must include (non-exhaustive):
    - `id` (plugin ID, currently `desk-sidebar`; for local dev it should match the folder name)
    - `name`
    - `version` (Semantic Versioning `x.y.z`)
    - `minAppVersion`
    - `description`
    - `isDesktopOnly` (boolean)
    - Optional: `author`, `authorUrl`, `fundingUrl` (string or map)
- Never change `id` after release. Treat it as stable API.
- Keep `minAppVersion` accurate when using newer APIs.
- Canonical requirements are coded here: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## Testing

- Manual install for testing: copy or symlink `main.js`, `manifest.json`, `styles.css` (if any) to:
    ```
    <Vault>/.obsidian/plugins/desk-sidebar/
    ```
- Reload Obsidian and enable the plugin in **Settings → Community plugins**.
- If Obsidian is sandboxed (Flatpak/Snap), a symlink may not resolve unless the vault path is
  inside that sandbox's exposed filesystem — see the "Testing in Obsidian" section of `README.md`.

## Commands & settings

- Any user-facing commands should be added via `this.addCommand(...)`.
- If the plugin has configuration, provide a settings tab and sensible defaults.
- Persist settings using `this.loadData()` / `this.saveData()`.
- Use stable command IDs; avoid renaming once released.

## Versioning & releases

- Bump `version` in `manifest.json` (SemVer) and update `versions.json` to map plugin version →
  minimum app version. `npm version patch|minor|major` runs `version-bump.mjs` to do this
  automatically.
- Create a GitHub release whose tag exactly matches `manifest.json`'s `version`. Do not use a
  leading `v` (the repo's `.npmrc` sets `tag-version-prefix=""` so `npm version` tags correctly).
- Attach `manifest.json`, `main.js`, and `styles.css` (if present) to the release as individual
  assets. The `release.yml` workflow does this automatically on a tag push, as a draft release.
- After the initial release, follow the process to add/update the plugin in the community catalog
  as required.

### Changelog workflow

- `CHANGELOG.md` is the canonical user-facing release history. Add notable features, behavior
  changes, fixes, removals, migrations, and security changes to **Unreleased** as part of the
  change that introduces them; omit internal refactors, tests, and routine documentation work.
- When cutting a release, move the **Unreleased** entries into a section named for the exact
  version and release date, recreate an empty **Unreleased** section, and update the comparison
  links at the bottom of the file.
- Use the completed version section to review and edit the draft GitHub release notes before
  publication.

## Security, privacy, and compliance

Follow Obsidian's **Developer Policies** and **Plugin Guidelines**. In particular:

- Default to local/offline operation. Only make network requests when essential to the feature.
- No hidden telemetry. If the plugin ever collects optional analytics or calls third-party
  services, require explicit opt-in and document clearly in `README.md` and in settings.
- Never execute remote code, fetch-and-eval scripts, or auto-update plugin code outside of normal
  releases.
- Minimize scope: read/write only what's necessary inside the vault. Do not access files outside
  the vault.
- Clearly disclose any external services used, data sent, and risks.
- Respect user privacy. Do not collect vault contents, filenames, or personal information unless
  absolutely necessary and explicitly consented.
- Avoid deceptive patterns, ads, or spammy notifications.
- Register and clean up all DOM, app, and interval listeners using the provided `register*`
  helpers so the plugin unloads safely.

## UX & copy guidelines (for UI text, commands, settings)

- Prefer sentence case for headings, buttons, and titles.
- Use clear, action-oriented imperatives in step-by-step copy.
- Use **bold** to indicate literal UI labels. Prefer "select" for interactions.
- Use arrow notation for navigation: **Settings → Community plugins**.
- Keep in-app strings short, consistent, and free of jargon.

## Performance

- Keep startup light. Defer heavy work until needed.
- Avoid long-running tasks during `onload`; use lazy initialization.
- Batch disk access and avoid excessive vault scans.
- Debounce/throttle expensive operations in response to file system events.

## Coding conventions

- TypeScript with `"strict": true` (already set in `tsconfig.json`).
- **Keep `main.ts` minimal**: focus only on plugin lifecycle (`onload`, `onunload`, `addCommand`
  calls). Delegate all feature logic to separate modules.
- **Split large files**: if any file exceeds ~200-300 lines, consider breaking it into smaller,
  focused modules.
- **Use clear module boundaries**: each file should have a single, well-defined responsibility.
- Bundle everything into `main.js` (no unbundled runtime deps).
- Avoid Node/Electron APIs if mobile compatibility matters; set `isDesktopOnly` accordingly.
- Prefer `async/await` over promise chains; handle errors gracefully.

## Mobile

- Where feasible, test on iOS and Android.
- Don't assume desktop-only behavior unless `isDesktopOnly` is `true`.
- Avoid large in-memory structures; be mindful of memory and storage constraints.

## Obsidian design & API conventions

Prefer Obsidian's own existing mechanisms over inventing new ones. Distilled from Obsidian's
[Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) and
[User interface](https://docs.obsidian.md/Plugins/User+interface/About+user+interface) docs:

- **App instance**: use `this.app`, never the global `app`/`window.app` (debugging-only, may be
  removed).
- **Logging**: avoid unnecessary `console.log`; the default console should only show real errors.
- **DOM construction**: never `innerHTML`/`outerHTML`/`insertAdjacentHTML` with user-derived
  content — use `createEl()`/`createDiv()`/`createSpan()` or the DOM API instead; `el.empty()` to
  clear a container.
- **Settings UI**: `minAppVersion` is `1.13.0`, so build settings tabs with the **declarative**
  `getSettingDefinitions()` API, not the legacy imperative `display()` override. Return an array of
  definitions (`{ name, control: { type, key, ... } }` for a simple bind; `render`/`action`/
  `group`/`list`/`page` for anything more complex) — Obsidian reads/writes `this.plugin.settings`
  and calls `saveData()` automatically for `control` bindings, and indexes definitions for the
  global settings search. Only drop to `render` (with a manual `Setting(...)` built against the
  row) for controls the declarative API doesn't cover yet (moment-format inputs, progress bars,
  custom suggesters, multi-button rows). Never build raw `<h1>`/`<h2>` headings — a `group`'s
  `heading`, or `.setHeading()` inside a `render` callback, are the only headings that stay visually
  consistent with the rest of Obsidian. Don't add a top-level "Settings"/plugin-name heading unless
  there's more than one section, and never repeat the word "settings" inside a heading. Use
  sentence case everywhere (e.g. "Template folder location", not "Template Folder Location"). Full
  reference: https://docs.obsidian.md/Plugins/User+interface/Settings
- **Styling**: no hardcoded inline styles (`el.style.color = ...`). Use CSS classes in
  `styles.css` plus Obsidian's CSS variables (`var(--text-normal)`, `var(--background-modifier-error)`,
  etc.) so themes and snippets can still restyle the plugin.
- **Vault access**:
  - Prefer the `Editor` API over `Vault.modify()` for the active file (preserves cursor/selection/
    folds, and is more efficient for small edits).
  - Prefer `Vault.process()` over `Vault.modify()` for background edits to a file that isn't open
    (atomic, avoids conflicts with other plugins).
  - Prefer `FileManager.processFrontMatter()` over manually parsing/rewriting YAML frontmatter.
  - Prefer the Vault API (`app.vault`) over the Adapter API (`app.vault.adapter`) — it's cached and
    serializes operations safely.
  - Use `Vault.getFileByPath()` / `getFolderByPath()` / `getAbstractFileByPath()` instead of
    iterating `getFiles()` to find a file by path.
  - Run any user-supplied or constructed path through `normalizePath()`.
- **Workspace**:
  - Use `workspace.getActiveViewOfType(...)` instead of `workspace.activeLeaf`.
  - Use `workspace.activeEditor?.editor` to access the editor of the active note.
  - Don't cache your own reference to a custom view instance in `registerView`'s factory — look it
    up via `workspace.getActiveLeavesOfType(VIEW_TYPE)` when needed.
  - Don't detach leaves in `onunload` — Obsidian reinitializes open leaves at their original
    position on update.
- **Commands**: don't set a default hotkey (conflicts with user-configured/other-plugin hotkeys).
  Use the right callback type — `callback` (unconditional), `checkCallback` (conditional),
  `editorCallback`/`editorCheckCallback` (needs an active Markdown editor).
- **Resource cleanup**: use `this.registerEvent()`, `this.registerDomEvent()`,
  `this.registerInterval()`, `this.addCommand()` etc. for anything that needs teardown on unload —
  don't manage listeners manually.
- **Code organization**: if the plugin grows past a single `.ts` file, organize into folders (see
  "File & folder conventions" above) to make review/maintenance easier.
- **Placeholder names**: rename any template placeholder class names (e.g. `MyPlugin`,
  `SampleSettingTab`) — already done here (`DeskPlugin`, `DeskSettingTab`).

For anything not covered above, check the primary sources before adding new UI or vault-access
patterns:

- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- User interface docs (Commands, Context menus, HTML elements, Icons, Modals, Ribbon actions,
  Settings, Status bar, Views, Workspace):
  https://docs.obsidian.md/Plugins/User+interface/About+user+interface
- Style guide (UI text/copy): https://help.obsidian.md/style-guide

## Agent do/don't

**Do**

- Add commands with stable IDs (don't rename once released).
- Provide defaults and validation in settings.
- Write idempotent code paths so reload/unload doesn't leak listeners or intervals.
- Use `this.register*` helpers for everything that needs cleanup.
- Reuse an existing Obsidian UI mechanism (Setting, Modal, SuggestModal, Notice, ItemView, ribbon
  icon, status bar item, context menu) before building a custom one.

**Don't**

- Introduce network calls without an obvious user-facing reason and documentation.
- Ship features that require cloud services without clear disclosure and explicit opt-in.
- Store or transmit vault contents unless essential and consented.

## Common tasks

### Organize code across multiple files

**main.ts** (minimal, lifecycle only):

```ts
import { Plugin } from 'obsidian';
import { DeskSettings, DEFAULT_SETTINGS } from './settings';
import { registerCommands } from './commands';

export default class DeskPlugin extends Plugin {
	settings!: DeskSettings;

	async onload() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<DeskSettings>,
		);
		registerCommands(this);
	}
}
```

**settings.ts**:

```ts
export interface DeskSettings {
	enabled: boolean;
}

export const DEFAULT_SETTINGS: DeskSettings = {
	enabled: true,
};
```

**commands/index.ts**:

```ts
import { Plugin } from 'obsidian';
import { doSomething } from './my-command';

export function registerCommands(plugin: Plugin) {
	plugin.addCommand({
		id: 'do-something',
		name: 'Do something',
		callback: () => doSomething(plugin),
	});
}
```

### Add a command

```ts
this.addCommand({
	id: 'your-command-id',
	name: 'Do the thing',
	callback: () => this.doTheThing(),
});
```

### Register listeners safely

```ts
this.registerEvent(
	this.app.workspace.on('file-open', (f) => {
		/* ... */
	}),
);
this.registerDomEvent(activeWindow, 'resize', () => {
	/* ... */
});
this.registerInterval(
	window.setInterval(() => {
		/* ... */
	}, 1000),
);
```

## Troubleshooting

- Plugin doesn't load after build: ensure `main.js` and `manifest.json` are at the top level of the
  plugin folder under `<Vault>/.obsidian/plugins/desk-sidebar/`.
- Build issues: if `main.js` is missing, run `npm run build` or `npm run dev` to compile the
  TypeScript source.
- Commands not appearing: verify `addCommand` runs after `onload` and IDs are unique.
- Settings not persisting: ensure `loadData`/`saveData` are awaited and the UI re-renders after
  changes.
- Symlinked plugin folder not visible inside Obsidian: if Obsidian is sandboxed (Flatpak/Snap),
  check its filesystem permissions expose the vault's path — see `README.md`.
- Mobile-only issues: confirm no desktop-only APIs are used; check `isDesktopOnly` and adjust.

## References

- Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- User interface docs: https://docs.obsidian.md/Plugins/User+interface/About+user+interface
- Style guide: https://help.obsidian.md/style-guide
