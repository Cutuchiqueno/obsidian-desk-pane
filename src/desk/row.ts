import { setIcon } from 'obsidian';

export interface DeskRow {
	el: HTMLElement;
	titleEl: HTMLElement;
	previewEl: HTMLElement;
}

/** A card per note: a header to fold, open, drag, or remove it, and the note's preview below. */
export function createRow(listEl: HTMLElement, path: string, collapsed: boolean): DeskRow {
	const el = listEl.createDiv({ cls: 'desk-item' });
	el.dataset.path = path;

	// Only the header is the drag handle, so text inside an unfolded preview stays selectable.
	const headerEl = el.createDiv({ cls: 'desk-item-header is-clickable' });
	headerEl.draggable = true;
	setIcon(headerEl.createDiv({ cls: 'clickable-icon collapse-icon' }), 'right-triangle');
	const titleEl = headerEl.createDiv({ cls: 'desk-item-title' });
	const removeEl = headerEl.createDiv({
		cls: 'clickable-icon desk-item-remove',
		attr: { 'aria-label': 'Remove from desk' },
	});
	setIcon(removeEl, 'x');
	const previewEl = el.createDiv({ cls: 'desk-item-preview markdown-rendered' });

	el.classList.toggle('is-collapsed', collapsed);
	return { el, titleEl, previewEl };
}

export function setRowTitle(row: DeskRow, path: string, exists: boolean): void {
	row.titleEl.setText(basename(path));
	row.el.classList.toggle('desk-item-missing', !exists);
}

function basename(path: string): string {
	const name = path.slice(path.lastIndexOf('/') + 1);
	return name.endsWith('.md') ? name.slice(0, -'.md'.length) : name;
}
