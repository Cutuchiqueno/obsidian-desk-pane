import { SearchComponent, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { ConfirmClearModal } from './confirm-clear';
import type { DeskStore } from './store';

/** The button row at the top of the pane, built like the ones in Obsidian's own sidebar panes. */
export class DeskToolbar {
	readonly el: HTMLElement;
	private readonly foldButtonEl: HTMLElement;
	private readonly clearButtonEl: HTMLElement;
	private readonly filterButtonEl: HTMLElement;
	private readonly search: SearchComponent;
	private readonly searchEl: HTMLElement;

	constructor(
		private readonly app: App,
		parentEl: HTMLElement,
		private readonly store: DeskStore,
		private readonly onFilterChange: (query: string) => void,
	) {
		this.el = parentEl.createDiv({ cls: 'nav-header' });
		const buttonsEl = this.el.createDiv({ cls: 'nav-buttons-container' });
		this.foldButtonEl = createButton(buttonsEl);
		this.clearButtonEl = createButton(buttonsEl);
		setIcon(this.clearButtonEl, 'list-x');
		this.clearButtonEl.setAttr('aria-label', 'Clear desk');
		// Same icon, wording, and search field as the Backlinks pane's filter.
		this.filterButtonEl = createButton(buttonsEl);
		setIcon(this.filterButtonEl, 'search');
		this.filterButtonEl.setAttr('aria-label', 'Show search filter');

		this.search = new SearchComponent(this.el).onChange((query) => this.onFilterChange(query));
		// The component builds its own `.search-input-container` around the input, as in Backlinks.
		this.searchEl = this.search.inputEl.parentElement ?? this.search.inputEl;
		this.searchEl.hide();
	}

	onClick(event: MouseEvent): void {
		if (!(event.target instanceof Element)) return;
		const buttonEl = event.target.closest('.nav-action-button');
		if (!buttonEl || buttonEl.hasClass('is-disabled')) return;
		if (buttonEl === this.foldButtonEl) {
			this.store.setAllFolded(this.anyUnfolded());
		} else if (buttonEl === this.clearButtonEl) {
			new ConfirmClearModal(this.app, this.store.entries.length, () => this.store.clear()).open();
		} else if (buttonEl === this.filterButtonEl) {
			this.toggleFilter();
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

	/** Hiding the field also drops its query, so no note stays hidden without a visible reason. */
	private toggleFilter(): void {
		const show = !this.filterButtonEl.hasClass('is-active');
		this.filterButtonEl.toggleClass('is-active', show);
		if (show) {
			this.searchEl.show();
			this.search.inputEl.focus();
		} else {
			this.searchEl.hide();
			if (this.search.getValue()) {
				this.search.setValue('');
				this.onFilterChange('');
			}
		}
	}

	private anyUnfolded(): boolean {
		return this.store.entries.some((entry) => !entry.collapsed);
	}
}

function createButton(buttonsEl: HTMLElement): HTMLElement {
	return buttonsEl.createDiv({ cls: 'clickable-icon nav-action-button' });
}
