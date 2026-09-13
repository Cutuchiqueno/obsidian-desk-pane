import { Modal, Setting } from 'obsidian';
import type { App } from 'obsidian';

/** Asks before emptying the desk, since there is no undo for losing its order and fold states. */
export class ConfirmClearModal extends Modal {
	constructor(
		app: App,
		private readonly count: number,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	override onOpen(): void {
		const notes = this.count === 1 ? '1 note' : `${this.count} notes`;
		this.setTitle('Clear desk?');
		this.contentEl.createEl('p', {
			text: `This takes ${notes} off your desk. The notes themselves stay in your vault.`,
		});
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText('Clear desk')
					.setDestructive()
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
