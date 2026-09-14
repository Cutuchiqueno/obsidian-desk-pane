import { setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { colorLabel, createSwatch, setColorAttr } from './color';
import { ConfirmUncolorModal } from './confirm-uncolor';
import type { DeskStore } from './store';
import { DESK_COLORS } from './types';
import type { DeskColor } from './types';

/**
 * The panel below the toolbar listing the colors in use with their note counts, like tags in the
 * Tags pane. Selecting colors shows only their notes; the buttons take colors off the notes.
 */
export class ColorFilter {
	readonly el: HTMLElement;
	private readonly selected = new Set<DeskColor>();
	private counts = new Map<DeskColor, number>();

	constructor(
		private readonly app: App,
		parentEl: HTMLElement,
		private readonly store: DeskStore,
		private readonly onChange: (colors: ReadonlySet<DeskColor>) => void,
	) {
		this.el = parentEl.createDiv({ cls: 'desk-color-filter' });
		this.el.hide();
	}

	/** Hiding the panel also drops its selection, so no note stays hidden without a visible reason. */
	setShown(shown: boolean): void {
		this.el.toggle(shown);
		if (shown || this.selected.size === 0) return;
		this.selected.clear();
		this.render();
		this.onChange(new Set());
	}

	update(counts: Map<DeskColor, number>): void {
		this.counts = counts;
		// For the same reason, a color no note has anymore can't stay selected without its row.
		const gone = Array.from(this.selected).filter((color) => !counts.has(color));
		for (const color of gone) this.selected.delete(color);
		this.render();
		if (gone.length > 0) this.onChange(new Set(this.selected));
	}

	onClick(event: MouseEvent): void {
		const target = event.target instanceof Element ? event.target : null;
		const itemEl = target?.closest<HTMLElement>('.desk-color-filter-item');
		const color = DESK_COLORS.find((key) => key === itemEl?.dataset.deskColor);
		if (target?.closest('.desk-color-filter-clear-all')) {
			const count = Array.from(this.counts.values()).reduce((sum, n) => sum + n, 0);
			new ConfirmUncolorModal(this.app, count, () => this.store.clearAllColors()).open();
		} else if (color && target?.closest('.desk-color-filter-clear')) {
			this.store.clearColor(color);
		} else if (color) {
			if (!this.selected.delete(color)) this.selected.add(color);
			this.render();
			this.onChange(new Set(this.selected));
		}
	}

	private render(): void {
		this.el.empty();
		if (this.counts.size === 0) {
			this.el.createDiv({ cls: 'desk-color-filter-empty', text: 'No notes have a color yet.' });
			return;
		}
		for (const [color, count] of this.counts) {
			const itemEl = this.el.createDiv({ cls: 'tree-item-self is-clickable desk-color-filter-item' });
			setColorAttr(itemEl, color);
			itemEl.toggleClass('is-active', this.selected.has(color));
			createSwatch(itemEl);
			itemEl.createDiv({ cls: 'tree-item-inner', text: colorLabel(color) });
			const flairEl = itemEl.createDiv({ cls: 'tree-item-flair-outer' });
			flairEl.createSpan({ cls: 'tree-item-flair', text: String(count) });
			const clearEl = flairEl.createDiv({
				cls: 'clickable-icon desk-color-filter-clear',
				attr: { 'aria-label': `Remove ${color} from notes` },
			});
			setIcon(clearEl, 'x');
		}
		const clearAllEl = this.el.createDiv({
			cls: 'tree-item-self is-clickable desk-color-filter-clear-all',
		});
		setIcon(clearAllEl.createDiv({ cls: 'desk-color-filter-icon' }), 'eraser');
		clearAllEl.createDiv({ cls: 'tree-item-inner', text: 'Remove all colors' });
	}
}
