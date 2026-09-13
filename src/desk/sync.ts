import { TFile } from 'obsidian';
import type DeskPlugin from '../main';
import type { DeskStore } from './store';

export function registerDeskVaultSync(plugin: DeskPlugin, store: DeskStore): void {
	plugin.registerEvent(
		plugin.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile) store.renamePath(oldPath, file.path);
		}),
	);
	plugin.registerEvent(
		plugin.app.vault.on('delete', (file) => {
			if (file instanceof TFile) store.removeByPath(file.path);
		}),
	);
}
