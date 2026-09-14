import { SearchComponent, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { countColors } from './color';
import { ColorFilter } from './color-filter';
import { ConfirmClearModal } from './confirm-clear';
import type { DeskStore } from './store';
import type { DeskColor } from './types';

/** The button row at the top of the pane, built like the ones in Obsidian's own sidebar panes. */
export class DeskToolbar {
	readonly el: HTMLElement;
	private readonly foldButtonEl: HTMLElement;
	private readonly clearButtonEl: HTMLElement;
	private readonly filterButtonEl: HTMLElement;
	private readonly colorFilterButtonEl: HTMLElement;
	private readonly groupButtonEl: HTMLElement;
	private readonly search: SearchComponent;
	private readonly searchEl: HTMLElement;
	private readonly colorFilter: ColorFilter;

	constructor(
		private readonly app: App,
		parentEl: HTMLElement,
		private readonly store: DeskStore,
		private readonly onFilterChange: (query: string) => void,
		onColorFilterChange: (colors: ReadonlySet<DeskColor>) => void,
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
		this.colorFilterButtonEl = createButton(buttonsEl);
		setIcon(this.colorFilterButtonEl, 'palette');
		this.colorFilterButtonEl.setAttr('aria-label', 'Show color filter');
		this.groupButtonEl = createButton(buttonsEl);
		setIcon(this.groupButtonEl, 'group');
		this.groupButtonEl.setAttr('aria-label', 'Group by color');

		this.search = new SearchComponent(this.el).onChange((query) => this.onFilterChange(query));
		// The component builds its own `.search-input-container` around the input, as in Backlinks.
		this.searchEl = this.search.inputEl.parentElement ?? this.search.inputEl;
		this.searchEl.hide();
		this.colorFilter = new ColorFilter(app, this.el, store, onColorFilterChange);
	}

	onClick(event: MouseEvent): void {
		if (!(event.target instanceof Element)) return;
		if (this.colorFilter.el.contains(event.target)) {
			this.colorFilter.onClick(event);
			return;
		}
		const buttonEl = event.target.closest('.nav-action-button');
		if (!buttonEl || buttonEl.hasClass('is-disabled')) return;
		if (buttonEl === this.foldButtonEl) {
			this.store.setAllFolded(this.anyUnfolded());
		} else if (buttonEl === this.clearButtonEl) {
			new ConfirmClearModal(this.app, this.store.entries.length, () => this.store.clear()).open();
		} else if (buttonEl === this.filterButtonEl) {
			this.toggleFilter();
		} else if (buttonEl === this.colorFilterButtonEl) {
			const show = !this.colorFilterButtonEl.hasClass('is-active');
			this.colorFilterButtonEl.toggleClass('is-active', show);
			this.colorFilter.setShown(show);
		} else if (buttonEl === this.groupButtonEl) {
			this.store.setGroupedByColor(!this.store.groupedByColor);
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

		const counts = countColors(this.store.entries);
		const grouped = this.store.groupedByColor;
		this.groupButtonEl.toggleClass('is-active', grouped);
		this.groupButtonEl.toggleClass('is-disabled', !grouped && counts.size === 0);
		this.colorFilter.update(counts);
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
