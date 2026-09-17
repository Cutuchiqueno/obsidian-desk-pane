import type { Menu, TAbstractFile } from 'obsidian';
import type DeskPlugin from '../main';
import { activateDeskView } from './commands';
import type { DeskStore } from './store';
import { DESK_ICON, isNoteFile } from './types';

/**
 * Puts **Add to desk** in Obsidian's own file menus, beside "Open in new window". Every menu the
 * `file-menu` event covers gets it: the File Explorer, a tab's and a note's more-options menu, a
 * link's context menu, the graph, Canvas, and Bases. `files-menu` covers a multiple selection.
 */
export function registerDeskFileMenu(plugin: DeskPlugin, store: DeskStore): void {
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, file) => addMenuItem(menu, [file], plugin, store)),
	);
	plugin.registerEvent(
		plugin.app.workspace.on('files-menu', (menu, files) => addMenuItem(menu, files, plugin, store)),
	);
}

function addMenuItem(
	menu: Menu,
	files: TAbstractFile[],
	plugin: DeskPlugin,
	store: DeskStore,
): void {
	// Folders and other file types get no item at all; notes already on the desk are left out, so
	// the item never silently reorders the desk.
	const paths = files
		.filter(isNoteFile)
		.map((file) => file.path)
		.filter((path) => !store.has(path));
	if (paths.length === 0) return;

	menu.addItem((item) =>
		item
			// The section of "Open in new tab", "Open to the right", and "Open in new window".
			.setSection('open')
			.setTitle(paths.length > 1 ? `Add ${paths.length} notes to desk` : 'Add to desk')
			.setIcon(DESK_ICON)
			.onClick(() => {
				// At the top of the desk, keeping the order they were selected in.
				paths.forEach((path, offset) => store.addOrMove(path, offset));
				// Opens the pane, so adding a note always has something to show for it.
				void activateDeskView(plugin.app);
			}),
	);
}
