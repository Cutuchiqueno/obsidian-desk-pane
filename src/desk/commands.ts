import type { App } from 'obsidian';
import type DeskPlugin from '../main';
import type { DeskStore } from './store';
import { DESK_ICON, isNoteFile, VIEW_TYPE_DESK } from './types';

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
		id: 'add-current-note',
		name: 'Add current note',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!isNoteFile(file)) return false;
			if (!checking) store.addOrMove(file.path, store.entries.length);
			return true;
		},
	});

	plugin.addCommand({
		id: 'remove-current-note',
		name: 'Remove current note',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || !store.has(file.path)) return false;
			if (!checking) store.removeByPath(file.path);
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
