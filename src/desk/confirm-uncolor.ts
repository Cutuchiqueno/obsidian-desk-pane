import { Modal, Setting } from 'obsidian';
import type { App } from 'obsidian';

/** Asks before taking every color off the desk, since there is no undo for losing them. */
export class ConfirmUncolorModal extends Modal {
	constructor(
		app: App,
		private readonly count: number,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	override onOpen(): void {
		const notes = this.count === 1 ? '1 note' : `${this.count} notes`;
		this.setTitle('Remove all colors?');
		this.contentEl.createEl('p', {
			text: `This takes the color off ${notes}. The notes stay on your desk.`,
		});
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText('Remove colors')
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
