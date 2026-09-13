import { Component, ItemView, Keymap, MarkdownRenderer, Menu, TFile } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import { DeskDragController } from './desk-drag';
import { createRow, setRowTitle } from './row';
import type { DeskRow } from './row';
import type { DeskStore } from './store';
import type { TabDrag } from './tab-drag';
import { DESK_ICON, VIEW_TYPE_DESK } from './types';
import type { DeskChange } from './types';

interface MountedRow extends DeskRow {
	preview: Component | null;
}

export class DeskView extends ItemView {
	private listEl!: HTMLElement;
	private emptyEl!: HTMLElement;
	private readonly rows = new Map<string, MountedRow>();

	constructor(
		leaf: WorkspaceLeaf,
		private readonly store: DeskStore,
		private readonly tabDrag: TabDrag,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_DESK;
	}

	getDisplayText(): string {
		return 'Desk';
	}

	override getIcon(): string {
		return DESK_ICON;
	}

	protected override async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('desk-view');
		this.emptyEl = this.contentEl.createDiv({
			cls: 'desk-empty',
			text: 'Drag notes or tabs here to put them on your desk.',
		});
		this.listEl = this.contentEl.createDiv({ cls: 'desk-list' });

		this.addChild(
			new DeskDragController(this.app, this.contentEl, this.listEl, this.store, this.tabDrag),
		);
		this.registerDomEvent(this.listEl, 'click', (event) => this.onClick(event));
		this.registerDomEvent(this.listEl, 'contextmenu', (event) => this.onContextMenu(event));
		this.registerEvent(this.store.onChange((change) => this.render(change)));
		this.render();
	}

	protected override async onClose(): Promise<void> {
		this.rows.clear();
		this.contentEl.empty();
	}

	private onClick(event: MouseEvent): void {
		const path = this.pathFromEvent(event);
		if (!path) return;
		if (event.target instanceof Element && event.target.closest('.collapse-icon')) {
			this.store.toggleFold(path);
			return;
		}
		const file = this.fileForPath(path);
		if (!file) return;
		void this.app.workspace.getLeaf(Keymap.isModEvent(event)).openFile(file);
	}

	private onContextMenu(event: MouseEvent): void {
		const path = this.pathFromEvent(event);
		if (!path) return;
		const index = this.store.indexOf(path);
		if (index < 0) return;
		event.preventDefault();

		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle('Move up')
				.setIcon('arrow-up')
				.setDisabled(index === 0)
				.onClick(() => this.store.moveOffset(path, -1)),
		);
		menu.addItem((item) =>
			item
				.setTitle('Move down')
				.setIcon('arrow-down')
				.setDisabled(index === this.store.entries.length - 1)
				.onClick(() => this.store.moveOffset(path, 1)),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle('Remove from desk')
				.setIcon('x')
				.onClick(() => this.store.removeByPath(path)),
		);
		menu.showAtMouseEvent(event);
	}

	private render(change?: DeskChange): void {
		if (change?.type === 'rename') {
			this.relabelRow(change.oldPath, change.newPath);
			return;
		}

		const entries = this.store.entries;
		this.emptyEl.classList.toggle('is-hidden', entries.length > 0);

		const listed = new Set<string>();
		let cursor: ChildNode | null = this.listEl.firstChild;
		for (const entry of entries) {
			listed.add(entry.path);
			const row = this.rows.get(entry.path) ?? this.mountRow(entry.path);
			if (cursor === row.el) {
				cursor = row.el.nextSibling;
			} else {
				this.listEl.insertBefore(row.el, cursor);
			}
			this.syncFold(row, entry.path, entry.collapsed);
		}

		for (const [path, row] of this.rows) {
			if (listed.has(path)) continue;
			this.unmountPreview(row);
			row.el.remove();
			this.rows.delete(path);
		}
	}

	private mountRow(path: string): MountedRow {
		const row: MountedRow = { ...createRow(this.listEl, path, true), preview: null };
		setRowTitle(row, path, this.fileForPath(path) !== null);
		this.rows.set(path, row);
		return row;
	}

	private relabelRow(oldPath: string, newPath: string): void {
		const row = this.rows.get(oldPath);
		if (!row) return;
		this.rows.delete(oldPath);
		this.rows.set(newPath, row);
		row.el.dataset.path = newPath;
		setRowTitle(row, newPath, this.fileForPath(newPath) !== null);
	}

	private syncFold(row: MountedRow, path: string, collapsed: boolean): void {
		row.el.classList.toggle('is-collapsed', collapsed);
		if (collapsed) {
			this.unmountPreview(row);
		} else if (!row.preview) {
			void this.mountPreview(row, path);
		}
	}

	private async mountPreview(row: MountedRow, path: string): Promise<void> {
		const file = this.fileForPath(path);
		if (!file) return;
		const preview = new Component();
		this.addChild(preview);
		row.preview = preview;

		const markdown = await this.app.vault.cachedRead(file);
		if (row.preview !== preview) return;
		row.previewEl.empty();
		await MarkdownRenderer.render(this.app, markdown, row.previewEl, file.path, preview);
	}

	private unmountPreview(row: MountedRow): void {
		if (!row.preview) return;
		this.removeChild(row.preview);
		row.preview = null;
		row.previewEl.empty();
	}

	private pathFromEvent(event: Event): string | null {
		if (!(event.target instanceof Element)) return null;
		return event.target.closest<HTMLElement>('.desk-item')?.dataset.path ?? null;
	}

	private fileForPath(path: string): TFile | null {
		const file = this.app.vault.getFileByPath(path);
		return file instanceof TFile ? file : null;
	}
}
