import { Plugin } from 'obsidian';
import { DeskSettings, DEFAULT_SETTINGS, DeskSettingTab } from './settings';
import { registerDeskCommands } from './desk/commands';
import { DeskStore } from './desk/store';
import { registerDeskVaultSync } from './desk/sync';
import { TabDrag } from './desk/tab-drag';
import { VIEW_TYPE_DESK } from './desk/types';
import { DeskView } from './desk/view';

export default class DeskPlugin extends Plugin {
	settings!: DeskSettings;
	store!: DeskStore;
	tabDrag!: TabDrag;

	async onload() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<DeskSettings>,
		);
		this.store = new DeskStore(this);
		this.tabDrag = new TabDrag(this);
		this.tabDrag.install();

		this.registerView(VIEW_TYPE_DESK, (leaf) => new DeskView(leaf, this.store, this.tabDrag));
		registerDeskCommands(this, this.store);
		registerDeskVaultSync(this, this.store);

		this.addSettingTab(new DeskSettingTab(this.app, this));
	}

	onunload() {}
}
