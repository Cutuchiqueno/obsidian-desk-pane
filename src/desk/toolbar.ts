import { setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { ConfirmClearModal } from './confirm-clear';
import type { DeskStore } from './store';

/** The button row at the top of the pane, built like the ones in Obsidian's own sidebar panes. */
export class DeskToolbar {
	readonly el: HTMLElement;
	private readonly foldButtonEl: HTMLElement;
	private readonly clearButtonEl: HTMLElement;

	constructor(
		private readonly app: App,
		parentEl: HTMLElement,
		private readonly store: DeskStore,
	) {
		this.el = parentEl.createDiv({ cls: 'nav-header' });
		const buttonsEl = this.el.createDiv({ cls: 'nav-buttons-container' });
		this.foldButtonEl = createButton(buttonsEl);
		this.clearButtonEl = createButton(buttonsEl);
		setIcon(this.clearButtonEl, 'list-x');
		this.clearButtonEl.setAttr('aria-label', 'Clear desk');
	}

	onClick(event: MouseEvent): void {
		if (!(event.target instanceof Element)) return;
		const buttonEl = event.target.closest('.nav-action-button');
		if (!buttonEl || buttonEl.hasClass('is-disabled')) return;
		if (buttonEl === this.foldButtonEl) {
			this.store.setAllFolded(this.anyUnfolded());
		} else if (buttonEl === this.clearButtonEl) {
			new ConfirmClearModal(this.app, this.store.entries.length, () => this.store.clear()).open();
		}
	}

	update(): void {
		const empty = this.store.entries.length === 0;
		const unfolded = this.anyUnfolded();
		// Same icons and wording as the File Explorer's own toggle.
		setIcon(this.foldButtonEl, unfolded ? 'chevrons-down-up' : 'chevrons-up-down');
		this.foldButtonEl.setAttr('aria-label', unfolded ? 'Collapse all' : 'Expand all');
		this.foldButtonEl.toggleClass('is-disabled', empty);
		this.clearButtonEl.toggleClass('is-disabled', empty);
	}

	private anyUnfolded(): boolean {
		return this.store.entries.some((entry) => !entry.collapsed);
	}
}

function createButton(buttonsEl: HTMLElement): HTMLElement {
	return buttonsEl.createDiv({ cls: 'clickable-icon nav-action-button' });
}
