import { Plugin } from 'obsidian';
import { DeskSettings, DEFAULT_SETTINGS, DeskSettingTab } from './settings';
import { registerDeskCommands } from './desk/commands';
import { registerDeskEditorMenu } from './desk/editor-menu';
import { registerDeskFileMenu } from './desk/file-menu';
import { DeskStore } from './desk/store';
import { DeviceStore } from './desk/sync/device';
import { SyncEngine } from './desk/sync/engine';
import { isReplicaKey } from './desk/sync/format';
import { TabDrag } from './desk/tab-drag';
import { VIEW_TYPE_DESK } from './desk/types';
import { registerDeskVaultEvents } from './desk/vault-events';
import { DeskView } from './desk/view';

export default class DeskPlugin extends Plugin {
	settings!: DeskSettings;
	store!: DeskStore;
	tabDrag!: TabDrag;
	device!: DeviceStore;
	sync!: SyncEngine;
	settingTab!: DeskSettingTab;

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, withoutReplicas(await this.loadData()));
		this.store = new DeskStore(this);
		this.device = new DeviceStore(this.app);
		this.sync = new SyncEngine(this, this.store, this.device, {
			defaultFolded: DEFAULT_SETTINGS.defaultFolded,
			cardMaxHeight: DEFAULT_SETTINGS.cardMaxHeight,
			inboxFolder: DEFAULT_SETTINGS.inboxFolder,
		});
		this.store.sync = this.sync;
		this.tabDrag = new TabDrag(this);
		this.tabDrag.install();

		this.registerView(VIEW_TYPE_DESK, (leaf) => new DeskView(leaf, this.store, this.tabDrag));
		registerDeskCommands(this, this.store);
		registerDeskFileMenu(this, this.store);
		registerDeskEditorMenu(this, this.store);
		registerDeskVaultEvents(this, this.store, this.sync);

		this.settingTab = new DeskSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);
		this.sync.onDevicesChanged = () => this.settingTab.update();

		if (this.device.syncEnabled) await this.sync.start(false);
	}

	onunload() {
		this.sync.unload();
	}

	/** Obsidian Sync, or another program, changed `data.json`. */
	async onExternalSettingsChange() {
		await this.sync.onExternalChange();
	}

	/**
	 * The one way to `data.json`. While the desk syncs, the sync engine writes the file and nothing
	 * else may: writing the settings would drop the replicas the other devices rely on.
	 */
	override async saveData(data: unknown): Promise<void> {
		if (this.sync?.active) return;
		await super.saveData(withoutReplicas(data));
	}

	/** For the sync engine only: writes exactly what it is given. */
	async saveRawData(data: unknown): Promise<void> {
		await super.saveData(data);
	}

	async setSyncEnabled(enabled: boolean): Promise<void> {
		if (enabled === this.device.syncEnabled) return;
		this.device.syncEnabled = enabled;
		if (enabled) {
			await this.sync.start(true);
		} else {
			await this.sync.stop();
			// Back to the plain settings, with the desk as it was last synced.
			await this.saveData(this.settings);
		}
		this.settingTab.update();
	}
}

/** The settings in `data.json`, without the replicas of the desk's sync. */
function withoutReplicas(data: unknown): Partial<DeskSettings> {
	if (data === null || typeof data !== 'object') return {};
	return Object.fromEntries(Object.entries(data).filter(([key]) => !isReplicaKey(key)));
}
