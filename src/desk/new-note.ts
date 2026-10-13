import { normalizePath, Notice } from 'obsidian';
import type { App, TFile, TFolder } from 'obsidian';
import type { DeskStore } from './store';

/** The name Obsidian gives its own new notes, numbered the same way while it's taken. */
const NEW_NOTE_NAME = 'Untitled';

/**
 * Creates an empty note in the inbox folder, puts it on the desk, and opens it in a new tab with
 * its title selected for naming, the way Obsidian's own **New note** does.
 */
export async function createDeskNote(app: App, store: DeskStore): Promise<void> {
	try {
		const folder = await getInboxFolder(app, store.inboxFolder);
		const file = await app.vault.create(freePath(app, folder), '');
		store.addCreated(file.path);
		await openInNewTab(app, file);
	} catch (error) {
		new Notice(`Couldn't create the note. ${error instanceof Error ? error.message : String(error)}`);
	}
}

/** A folder that doesn't exist yet is created with the first note that goes there. */
async function getInboxFolder(app: App, setting: string): Promise<TFolder> {
	const path = normalizePath(setting);
	const folder = app.vault.getFolderByPath(path);
	if (folder) return folder;
	if (app.vault.getFileByPath(path)) {
		throw new Error(`The inbox folder "${path}" is a file. Pick another folder in the settings.`);
	}
	return app.vault.createFolder(path);
}

/** "Untitled", then "Untitled 1", "Untitled 2"…, whichever the folder doesn't have yet. */
function freePath(app: App, folder: TFolder): string {
	const prefix = folder.isRoot() ? '' : `${folder.path}/`;
	let path = `${prefix}${NEW_NOTE_NAME}.md`;
	for (let n = 1; app.vault.getAbstractFileByPath(path); n++) {
		path = `${prefix}${NEW_NOTE_NAME} ${n}.md`;
	}
	return path;
}

/**
 * `'tab'` always makes a new tab in the editor area, even while the pane has focus, and never a
 * split. The view state is the one Obsidian's own **New note** opens with: editing mode, title
 * selected. `rename` isn't documented API, so an Obsidian without it just opens the note.
 */
async function openInNewTab(app: App, file: TFile): Promise<void> {
	await app.workspace.getLeaf('tab').openFile(file, {
		active: true,
		state: { mode: 'source' },
		eState: { rename: 'all' },
	});
}
