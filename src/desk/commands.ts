import { MarkdownView } from 'obsidian';
import type { App } from 'obsidian';
import type DeskPlugin from '../main';
import { addToCanvas } from './canvas';
import { addCursorPart, cursorPartKind } from './cursor-part';
import { addInboxNotes } from './inbox';
import { createDeskNote } from './new-note';
import type { DeskStore } from './store';
import { DESK_ICON, isNoteFile, VIEW_TYPE_DESK } from './types';
import type { DeskEntry } from './types';
import { DeskView } from './view';

export async function activateDeskView(app: App): Promise<void> {
	const existing = app.workspace.getLeavesOfType(VIEW_TYPE_DESK)[0];
	if (existing) {
		await app.workspace.revealLeaf(existing);
		return;
	}
	const leaf = app.workspace.getRightLeaf(false);
	if (!leaf) return;
	await leaf.setViewState({ type: VIEW_TYPE_DESK, active: true });
	await app.workspace.revealLeaf(leaf);
}

export function registerDeskCommands(plugin: DeskPlugin, store: DeskStore): void {
	plugin.addCommand({
		id: 'open-pane',
		name: 'Open pane',
		callback: () => void activateDeskView(plugin.app),
	});

	plugin.addCommand({
		id: 'new-note',
		name: 'Create new note',
		callback: () => void createNoteWithPane(plugin.app, store),
	});

	plugin.addCommand({
		id: 'add-inbox-notes',
		name: 'Add notes from inbox',
		callback: () => void addInboxNotesWithPane(plugin.app, store),
	});

	plugin.addCommand({
		id: 'add-current-note',
		name: 'Add current note',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!isNoteFile(file)) return false;
			if (!checking) store.addOrMove({ path: file.path }, store.entries.length);
			return true;
		},
	});

	plugin.addCommand({
		id: 'add-current-block',
		name: 'Add current heading or block',
		editorCheckCallback: (checking, _editor, ctx) => {
			if (!(ctx instanceof MarkdownView) || !cursorPartKind(plugin.app, store, ctx)) return false;
			if (!checking) void addCursorPart(plugin.app, store, ctx);
			return true;
		},
	});

	plugin.addCommand({
		id: 'remove-current-note',
		name: 'Remove current note',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || !store.has(file.path)) return false;
			if (!checking) store.remove(file.path);
			return true;
		},
	});

	plugin.addCommand({
		id: 'add-cards-to-canvas',
		name: 'Add cards to canvas',
		checkCallback: (checking) => {
			const entries = visibleEntries(plugin.app, store);
			if (entries.length === 0) return false;
			if (!checking) addToCanvas(plugin.app, entries);
			return true;
		},
	});

	plugin.addCommand({
		id: 'toggle-group-by-color',
		name: 'Toggle grouping by color',
		checkCallback: (checking) => {
			const grouped = store.groupedByColor;
			if (!grouped && !store.entries.some((entry) => entry.color)) return false;
			if (!checking) store.setGroupedByColor(!grouped);
			return true;
		},
	});

	plugin.addRibbonIcon(DESK_ICON, 'Open desk', () => void activateDeskView(plugin.app));
}

/** The pane opens first, so the note's new tab is what ends up focused. */
async function createNoteWithPane(app: App, store: DeskStore): Promise<void> {
	await activateDeskView(app);
	await createDeskNote(app, store);
}

/** The cards the pane's filters leave visible; a pane that isn't loaded filters none out. */
function visibleEntries(app: App, store: DeskStore): DeskEntry[] {
	const view = app.workspace.getLeavesOfType(VIEW_TYPE_DESK)[0]?.view;
	return view instanceof DeskView ? view.visibleEntries() : store.entries;
}

/** The pane opens first, so the notes have somewhere to show up. */
async function addInboxNotesWithPane(app: App, store: DeskStore): Promise<void> {
	await activateDeskView(app);
	addInboxNotes(app, store);
}
