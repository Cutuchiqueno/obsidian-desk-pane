import { TFile } from 'obsidian';
import type DeskPlugin from '../main';
import type { DeskStore } from './store';
import type { SyncEngine } from './sync/engine';

/**
 * Cards follow their notes through the vault: renamed with them, and off the desk when they go.
 * With sync on, a deletion waits a moment, as Obsidian Sync delivers a rename as a delete and a
 * create, and a note may come back under its old name.
 */
export function registerDeskVaultEvents(plugin: DeskPlugin, store: DeskStore, sync: SyncEngine): void {
	plugin.registerEvent(
		plugin.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile) store.renamePath(oldPath, file.path);
		}),
	);
	plugin.registerEvent(
		plugin.app.vault.on('delete', (file) => {
			if (!(file instanceof TFile)) return;
			if (sync.active) sync.scheduleDelete(file.path);
			else store.removeNote(file.path);
		}),
	);
}
