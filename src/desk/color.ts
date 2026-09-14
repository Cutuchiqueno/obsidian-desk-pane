import { Menu } from 'obsidian';
import { DESK_COLORS } from './types';
import type { DeskColor, DeskEntry } from './types';

export function colorLabel(color: DeskColor | undefined): string {
	return color ? color.charAt(0).toUpperCase() + color.slice(1) : 'No color';
}

/** styles.css turns this attribute into `--desk-color`, for `el` and every swatch inside it. */
export function setColorAttr(el: HTMLElement, color: DeskColor | undefined): void {
	el.setAttr('data-desk-color', color ?? null);
}

/** A dot in the surrounding `--desk-color`, or an empty ring where there is none. */
export function createSwatch(parent: Node, color?: DeskColor): HTMLElement {
	return parent.createSpan({ cls: 'desk-color-swatch', attr: { 'data-desk-color': color ?? null } });
}

/** How many notes have each color, in palette order, leaving out the colors no note has. */
export function countColors(entries: DeskEntry[]): Map<DeskColor, number> {
	const counts = new Map<DeskColor, number>();
	for (const color of DESK_COLORS) {
		const count = entries.filter((entry) => entry.color === color).length;
		if (count > 0) counts.set(color, count);
	}
	return counts;
}

export function showColorMenu(
	event: MouseEvent,
	current: DeskColor | undefined,
	onSelect: (color: DeskColor | undefined) => void,
): void {
	// A native menu would drop the swatches.
	const menu = new Menu().setUseNativeMenu(false);
	for (const color of [undefined, ...DESK_COLORS]) {
		const title = createFragment((fragment) => {
			const optionEl = fragment.createSpan({ cls: 'desk-color-option' });
			createSwatch(optionEl, color);
			optionEl.appendText(colorLabel(color));
		});
		menu.addItem((item) =>
			item
				.setTitle(title)
				.setChecked(color === current)
				.onClick(() => onSelect(color)),
		);
		if (!color) menu.addSeparator();
	}
	menu.showAtMouseEvent(event);
}
