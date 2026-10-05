import { setIcon } from 'obsidian';
import { colorLabel, createSwatch, setColorAttr } from './color';
import type { DeskColor } from './types';

export interface DeskRow {
	el: HTMLElement;
	titleEl: HTMLElement;
	previewEl: HTMLElement;
}

export interface GroupHeader {
	el: HTMLElement;
	countEl: HTMLElement;
	foldEl: HTMLElement;
}

/** A card per note: a header to fold, open, drag, color, or remove it, and its preview below. */
export function createRow(listEl: HTMLElement, path: string, collapsed: boolean): DeskRow {
	const el = listEl.createDiv({ cls: 'desk-item' });
	el.dataset.path = path;

	// Only the header is the drag handle, so text inside an unfolded preview stays selectable.
	const headerEl = el.createDiv({ cls: 'desk-item-header is-clickable' });
	headerEl.draggable = true;
	setIcon(headerEl.createDiv({ cls: 'clickable-icon collapse-icon' }), 'right-triangle');
	const titleEl = headerEl.createDiv({ cls: 'desk-item-title' });
	const colorEl = headerEl.createDiv({
		cls: 'clickable-icon desk-item-color',
		attr: { 'aria-label': 'Set color' },
	});
	createSwatch(colorEl);
	const removeEl = headerEl.createDiv({
		cls: 'clickable-icon desk-item-remove',
		attr: { 'aria-label': 'Remove from desk' },
	});
	setIcon(removeEl, 'x');
	const previewEl = el.createDiv({ cls: 'desk-item-preview markdown-rendered' });
	el.createDiv({ cls: 'desk-item-resize-handle' });

	el.classList.toggle('is-collapsed', collapsed);
	return { el, titleEl, previewEl };
}

export function setPreviewHeight(previewEl: HTMLElement, height: number | undefined): void {
	previewEl.setCssProps({ '--desk-preview-height': height === undefined ? '' : `${height}px` });
}

/** Heads a block of same-colored notes while the desk is grouped by color. */
export function createGroupHeader(color: DeskColor | undefined): GroupHeader {
	const el = createDiv({ cls: 'desk-group-header' });
	setColorAttr(el, color);
	createSwatch(el);
	el.createSpan({ cls: 'desk-group-title', text: colorLabel(color) });
	const countEl = el.createSpan({ cls: 'desk-group-count' });
	const foldEl = el.createDiv({ cls: 'clickable-icon desk-group-fold' });
	return { el, countEl, foldEl };
}

/** Same icons and wording as the toolbar's button, for just the notes of one group. */
export function setGroupFoldButton(foldEl: HTMLElement, anyUnfolded: boolean): void {
	setIcon(foldEl, anyUnfolded ? 'chevrons-down-up' : 'chevrons-up-down');
	foldEl.setAttr('aria-label', anyUnfolded ? 'Collapse all in group' : 'Expand all in group');
}

export function setRowTitle(row: DeskRow, path: string, exists: boolean): void {
	row.titleEl.setText(basename(path));
	row.el.classList.toggle('desk-item-missing', !exists);
}

export function basename(path: string): string {
	const name = path.slice(path.lastIndexOf('/') + 1);
	return name.endsWith('.md') ? name.slice(0, -'.md'.length) : name;
}
