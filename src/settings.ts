import { App, PluginSettingTab } from 'obsidian';
import type DeskPlugin from './main';

export type DeskSettings = Record<string, never>;

export const DEFAULT_SETTINGS: DeskSettings = {};

export class DeskSettingTab extends PluginSettingTab {
	plugin: DeskPlugin;

	constructor(app: App, plugin: DeskPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions() {
		return [];
	}
}
