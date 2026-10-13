import { normalizePath, Notice } from 'obsidian';
import type { App, TFolder } from 'obsidian';
import { ConfirmInboxModal } from './confirm-inbox';
import type { DeskStore } from './store';
import { isNoteFile } from './types';

/** Up to this many notes go on the desk right away; more ask first, since the inbox may be the vault root. */
const CONFIRM_ABOVE = 10;

/**
 * Puts the inbox folder's notes that aren't on the desk yet on top of it, newest first. Only the
 * folder's own notes go: those in its subfolders stay off the desk.
 */
export function addInboxNotes(app: App, store: DeskStore): void {
	const path = normalizePath(store.inboxFolder);
	const folder = app.vault.getFolderByPath(path);
	if (!folder) {
		new Notice(`There's no inbox folder "${path}" yet.`);
		return;
	}
	const notes = folder.children.filter(isNoteFile);
	const paths = notes
		.filter((file) => !store.has(file.path))
		.sort((a, b) => b.stat.ctime - a.stat.ctime)
		.map((file) => file.path);
	if (paths.length === 0) {
		new Notice(
			notes.length === 0
				? 'The inbox has no notes.'
				: 'All notes in the inbox are already on the desk.',
		);
		return;
	}

	const add = () => {
		const added = store.addAllOnTop(paths);
		new Notice(`Added ${added === 1 ? '1 note' : `${added} notes`} from the inbox.`);
	};
	if (paths.length > CONFIRM_ABOVE) {
		new ConfirmInboxModal(app, paths.length, describeFolder(folder), add).open();
	} else {
		add();
	}
}

function describeFolder(folder: TFolder): string {
	return folder.isRoot() ? 'the vault root' : `"${folder.path}"`;
}
