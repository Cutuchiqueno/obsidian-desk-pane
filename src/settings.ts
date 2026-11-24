import { App, moment, PluginSettingTab } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import type DeskPlugin from './main';
import { CARD_HEIGHT_DEFAULT, CARD_HEIGHT_MAX, CARD_HEIGHT_MIN } from './desk/types';
import type { DeskEntry, GroupNames } from './desk/types';

export interface DeskSettings {
	entries: DeskEntry[];
	defaultFolded: boolean;
	groupedByColor: boolean;
	groupNames: GroupNames;
	/** Percent of the pane's height a card may grow to. */
	cardMaxHeight: number;
	/** Where the pane creates new notes; empty for the vault root. */
	inboxFolder: string;
}

export const DEFAULT_SETTINGS: DeskSettings = {
	entries: [],
	defaultFolded: true,
	groupedByColor: false,
	groupNames: {},
	cardMaxHeight: CARD_HEIGHT_DEFAULT,
	inboxFolder: '',
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
			{
				name: 'Maximum card height',
				desc: 'How tall a card may grow, as a share of the pane. Longer notes scroll inside the card.',
				aliases: ['card size', 'preview height'],
				control: {
					type: 'slider',
					key: 'cardMaxHeight',
					min: CARD_HEIGHT_MIN,
					max: CARD_HEIGHT_MAX,
					step: 5,
					defaultValue: CARD_HEIGHT_DEFAULT,
					displayFormat: (value) => `${value}%`,
				},
			},
			{
				name: 'Inbox folder',
				desc: 'Where notes created from the Desk pane go, and where adding the inbox takes notes from. Leave empty for the vault root.',
				aliases: ['new note location', 'new notes folder'],
				control: { type: 'folder', key: 'inboxFolder', placeholder: '/', includeRoot: true },
			},
			this.syncGroup(),
		];
	}

	private syncGroup(): SettingDefinitionItem {
		const sync = this.plugin.sync;
		const syncing = () => sync.active;
		return {
			type: 'group',
			heading: 'Sync',
			items: [
				{
					name: 'Sync desk across devices',
					desc: "Keep the desk the same on every device that syncs this vault with Obsidian Sync. Turn it on for each device, along with Installed community plugins in that device's Sync settings.",
					aliases: ['obsidian sync', 'devices', 'mobile'],
					control: { type: 'toggle', key: 'syncEnabled' },
				},
				{
					name: 'Device name',
					desc: 'How this device appears in the list of devices, here and on your other devices.',
					visible: syncing,
					control: { type: 'text', key: 'deviceName', placeholder: this.plugin.device.defaultName() },
				},
				...sync.devices.map((device) => ({
					name: device.isThisDevice ? `${device.name} (this device)` : device.name,
					desc: deviceStatus(device.seen, device.clockAhead),
					visible: syncing,
					searchable: false,
				})),
			],
		};
	}

	override getControlValue(key: string): unknown {
		if (key === 'syncEnabled') return this.plugin.device.syncEnabled;
		if (key === 'deviceName') return this.plugin.sync.active ? this.plugin.sync.deviceName : '';
		return super.getControlValue(key);
	}

	/**
	 * Every setting goes through the store, which saves it or, with sync on, hands it to the sync
	 * engine; open panes follow at once rather than on the next reload.
	 */
	override async setControlValue(key: string, value: unknown): Promise<void> {
		const { settings, store } = this.plugin;
		switch (key) {
			case 'cardMaxHeight':
				if (typeof value === 'number') store.setCardMaxHeight(value);
				return;
			case 'defaultFolded':
				if (typeof value === 'boolean') {
					settings.defaultFolded = value;
					store.prefsChanged();
				}
				return;
			case 'inboxFolder':
				if (typeof value === 'string') {
					settings.inboxFolder = value;
					store.prefsChanged();
				}
				return;
			case 'syncEnabled':
				if (typeof value === 'boolean') await this.plugin.setSyncEnabled(value);
				return;
			case 'deviceName':
				if (typeof value === 'string') this.plugin.sync.setDeviceName(value);
				return;
		}
		await super.setControlValue(key, value);
	}
}

/** When a device last wrote the desk, and whether its clock runs ahead of this one. */
function deviceStatus(seen: number | undefined, clockAhead: boolean): string {
	if (seen === undefined) return 'Has not synced the desk yet.';
	if (clockAhead) return "Last synced at a time still ahead: that device's clock runs fast.";
	return `Last synced ${moment(seen).fromNow()}.`;
}
