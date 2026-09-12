import { Plugin } from 'obsidian';
import { DeskSettings, DEFAULT_SETTINGS, DeskSettingTab } from './settings';

export default class DeskPlugin extends Plugin {
	settings!: DeskSettings;

	async onload() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<DeskSettings>,
		);

		this.addSettingTab(new DeskSettingTab(this.app, this));
	}

	onunload() {}
}
