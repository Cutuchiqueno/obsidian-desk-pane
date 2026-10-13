import { MarkdownView } from 'obsidian';
import type DeskPlugin from '../main';
import { activateDeskView } from './commands';
import { addCursorPart, cursorPartKind } from './cursor-part';
import type { DeskStore } from './store';
import { DESK_ICON } from './types';

/**
 * Puts **Add heading to desk** or **Add block to desk** in a note's editor menu, for the heading or
 * block under the cursor. Like **Add to desk** in the file menus, it's left out for one already on
 * the desk, and opens the pane.
 */
export function registerDeskEditorMenu(plugin: DeskPlugin, store: DeskStore): void {
	plugin.registerEvent(
		plugin.app.workspace.on('editor-menu', (menu, _editor, info) => {
			// Embedded editors, like a canvas card's, aren't views that can save their note first.
			if (!(info instanceof MarkdownView)) return;
			const kind = cursorPartKind(plugin.app, store, info);
			if (!kind) return;
			menu.addItem((item) =>
				item
					.setTitle(kind === 'heading' ? 'Add heading to desk' : 'Add block to desk')
					.setIcon(DESK_ICON)
					.onClick(() => void addAndShow(plugin, store, info)),
			);
		}),
	);
}

async function addAndShow(plugin: DeskPlugin, store: DeskStore, view: MarkdownView): Promise<void> {
	if (await addCursorPart(plugin.app, store, view)) await activateDeskView(plugin.app);
}
