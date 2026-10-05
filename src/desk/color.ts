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

/**
 * Swaps the name of a color's group, in its header or in the color filter, for a text field in its
 * place. As when renaming a file in the file explorer, Enter or leaving the field keeps what was
 * typed and Escape drops it.
 */
export function editColorName(
	nameEl: HTMLElement,
	color: DeskColor | undefined,
	onSubmit: (name: string) => void,
): void {
	const inputEl = createEl('input', {
		cls: 'desk-name-input',
		type: 'text',
		value: nameEl.getText(),
		// Shown once the field is cleared, which is how a group gets its color's name back.
		placeholder: colorLabel(color),
		attr: { 'aria-label': 'Group name' },
	});
	let done = false;
	const finish = (submit: boolean): void => {
		if (done) return;
		done = true;
		const name = inputEl.value;
		inputEl.replaceWith(nameEl);
		// Deferred, since the field also loses focus when a re-render removes it, and saving right
		// then would start another render inside that one.
		if (submit) queueMicrotask(() => onSubmit(name));
	};
	inputEl.addEventListener('keydown', (event) => {
		// Enter also confirms a word picked in an input method, which mustn't end the edit.
		if (event.isComposing) return;
		if (event.key === 'Enter') finish(true);
		else if (event.key === 'Escape') finish(false);
		else return;
		event.preventDefault();
	});
	inputEl.addEventListener('blur', () => finish(true));
	nameEl.replaceWith(inputEl);
	inputEl.focus();
	inputEl.select();
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

/** `labelOf` names each color, so a color whose group was renamed is listed under that name. */
export function showColorMenu(
	event: MouseEvent,
	current: DeskColor | undefined,
	labelOf: (color: DeskColor | undefined) => string,
	onSelect: (color: DeskColor | undefined) => void,
): void {
	// A native menu would drop the swatches.
	const menu = new Menu().setUseNativeMenu(false);
	for (const color of [undefined, ...DESK_COLORS]) {
		const title = createFragment((fragment) => {
			const optionEl = fragment.createSpan({ cls: 'desk-color-option' });
			createSwatch(optionEl, color);
			optionEl.appendText(labelOf(color));
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
