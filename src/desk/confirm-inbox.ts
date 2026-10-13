import { Modal, Setting } from 'obsidian';
import type { App } from 'obsidian';

/** Asks before adding many inbox notes at once, since only **Clear desk** takes them all off again. */
export class ConfirmInboxModal extends Modal {
	constructor(
		app: App,
		private readonly count: number,
		private readonly folder: string,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	override onOpen(): void {
		const notes = `${this.count} notes`;
		this.setTitle(`Add ${notes} to desk?`);
		this.contentEl.createEl('p', {
			text: `This puts ${notes} from ${this.folder} on top of your desk, newest first.`,
		});
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText('Add notes')
					.setCta()
					.onClick(() => {
						this.close();
						this.onConfirm();
					}),
			);
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
