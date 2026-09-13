import { setIcon } from 'obsidian';

export interface DeskRow {
	el: HTMLElement;
	titleEl: HTMLElement;
	previewEl: HTMLElement;
}

/** Mirrors the DOM shape of Obsidian's own collapsible panes (Outline, Backlinks, File Explorer). */
export function createRow(listEl: HTMLElement, path: string, collapsed: boolean): DeskRow {
	const el = listEl.createDiv({ cls: 'tree-item desk-item' });
	el.dataset.path = path;

	// Only the header is the drag handle, so text inside an unfolded preview stays selectable.
	const headerEl = el.createDiv({ cls: 'tree-item-self is-clickable desk-item-header' });
	headerEl.draggable = true;
	setIcon(headerEl.createDiv({ cls: 'tree-item-icon collapse-icon' }), 'right-triangle');
	const titleEl = headerEl.createDiv({ cls: 'tree-item-inner desk-item-title' });
	const previewEl = el.createDiv({
		cls: 'tree-item-children desk-item-preview markdown-rendered',
	});

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
