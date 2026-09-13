import { App, PluginSettingTab } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import type DeskPlugin from './main';
import type { DeskEntry } from './desk/types';

export interface DeskSettings {
	entries: DeskEntry[];
	defaultFolded: boolean;
}

export const DEFAULT_SETTINGS: DeskSettings = {
	entries: [],
	defaultFolded: true,
};

export class DeskSettingTab extends PluginSettingTab {
	plugin: DeskPlugin;

	constructor(app: App, plugin: DeskPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Add new notes folded',
				desc: 'When a note is added to the Desk pane, show only its title until you expand it.',
				control: { type: 'toggle', key: 'defaultFolded' },
			},
		];
	}
}
