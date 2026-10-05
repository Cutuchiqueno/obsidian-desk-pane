import { App, PluginSettingTab } from 'obsidian';
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
}

export const DEFAULT_SETTINGS: DeskSettings = {
	entries: [],
	defaultFolded: true,
	groupedByColor: false,
	groupNames: {},
	cardMaxHeight: CARD_HEIGHT_DEFAULT,
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
		];
	}

	/** Routed through the store, so open panes resize with the slider instead of on the next reload. */
	override async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'cardMaxHeight' && typeof value === 'number') {
			this.plugin.store.setCardMaxHeight(value);
			return;
		}
		await super.setControlValue(key, value);
	}
}
