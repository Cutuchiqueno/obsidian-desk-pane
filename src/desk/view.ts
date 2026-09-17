import { Component, ItemView, Keymap, MarkdownRenderer, Menu, setIcon } from 'obsidian';
import type { TFile, WorkspaceLeaf } from 'obsidian';
import { setColorAttr, showColorMenu } from './color';
import { DeskDragController } from './desk-drag';
import { DeskResizeController } from './desk-resize';
import { noteMatchesFilter } from './filter';
import { createGroupHeader, createRow, setPreviewHeight, setRowTitle } from './row';
import type { DeskRow, GroupHeader } from './row';
import type { DeskStore } from './store';
import type { TabDrag } from './tab-drag';
import { DeskToolbar } from './toolbar';
import { DESK_ICON, isNoteFile, VIEW_TYPE_DESK } from './types';
import type { DeskChange, DeskColor } from './types';

interface MountedRow extends DeskRow {
	preview: Component | null;
}

interface MountedGroup extends GroupHeader {
	color: DeskColor | undefined;
	rows: MountedRow[];
}

export class DeskView extends ItemView {
	private listEl!: HTMLElement;
	private emptyEl!: HTMLElement;
	private noMatchesEl!: HTMLElement;
	private toolbar!: DeskToolbar;
	private readonly rows = new Map<string, MountedRow>();
	private groups: MountedGroup[] = [];
	private filterQuery = '';
	private colorFilter: ReadonlySet<DeskColor> = new Set();
	/** Bumped on every filter pass, so a slower earlier pass can't overwrite a newer one's result. */
	private filterPass = 0;

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
		this.toolbar = new DeskToolbar(
			this.app,
			this.contentEl,
			this.store,
			(query) => this.setFilter(query),
			(colors) => this.setColorFilter(colors),
		);
		const bodyEl = this.contentEl.createDiv({ cls: 'desk-body' });
		this.emptyEl = bodyEl.createDiv({ cls: 'desk-empty' });
		setIcon(this.emptyEl.createDiv({ cls: 'desk-empty-icon' }), DESK_ICON);
		this.emptyEl.createDiv({
			cls: 'desk-empty-text',
			text: 'Drag notes or tabs here to put them on your desk.',
		});
		this.noMatchesEl = bodyEl.createDiv({
			cls: 'desk-empty-text desk-no-matches is-hidden',
			text: 'No notes match the filter.',
		});
		this.listEl = bodyEl.createDiv({ cls: 'desk-list' });
		this.applyCardMaxHeight();

		this.addChild(
			new DeskDragController(this.app, this.contentEl, this.listEl, this.store, this.tabDrag),
		);
		this.addChild(new DeskResizeController(this.listEl, this.store));
		this.registerDomEvent(this.toolbar.el, 'click', (event) => this.toolbar.onClick(event));
		this.registerDomEvent(this.listEl, 'click', (event) => this.onClick(event));
		this.registerDomEvent(this.listEl, 'contextmenu', (event) => this.onContextMenu(event));
		this.registerEvent(this.store.onChange((change) => this.render(change)));
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (this.filterQuery && this.rows.has(file.path)) void this.applyFilter();
			}),
		);
		this.render();
	}

	protected override async onClose(): Promise<void> {
		this.rows.clear();
		this.groups = [];
		this.contentEl.empty();
	}

	private onClick(event: MouseEvent): void {
		const path = this.pathFromEvent(event);
		if (!path) return;
		const target = event.target instanceof Element ? event.target : null;
		if (target?.closest('.desk-item-remove')) {
			this.store.removeByPath(path);
		} else if (target?.closest('.desk-item-color')) {
			const current = this.store.entries[this.store.indexOf(path)]?.color;
			showColorMenu(event, current, (color) => this.store.setColor(path, color));
		} else if (target?.closest('.desk-item-header')) {
			// Clicks inside a preview are left alone, for selecting text and following links.
			this.store.toggleFold(path);
		}
	}

	private onContextMenu(event: MouseEvent): void {
		const path = this.pathFromEvent(event);
		if (!path) return;
		const index = this.store.indexOf(path);
		if (index < 0) return;
		event.preventDefault();

		const menu = new Menu();
		const file = this.fileForPath(path);
		menu.addItem((item) =>
			item
				.setTitle('Open note')
				.setIcon('file-text')
				.setDisabled(!file)
				.onClick(() => {
					if (file) void this.app.workspace.getLeaf(Keymap.isModEvent(event)).openFile(file);
				}),
		);
		menu.addSeparator();
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
				.setTitle('Reset height')
				.setIcon('unfold-vertical')
				.setDisabled(this.store.entries[index]?.previewHeight === undefined)
				.onClick(() => this.store.setPreviewHeight(path, undefined)),
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
		if (change?.type === 'card-height') {
			this.applyCardMaxHeight();
			return;
		}
		if (change?.type === 'rename') {
			this.relabelRow(change.oldPath, change.newPath);
			void this.applyFilter();
			return;
		}

		const entries = this.store.entries;
		this.emptyEl.classList.toggle('is-hidden', entries.length > 0);
		this.toolbar.update();

		// Headers are rebuilt on every render, since any change can move where a color's block starts.
		for (const { el } of this.groups) el.remove();
		this.groups = [];
		const grouped = this.store.groupedByColor;
		let group: MountedGroup | undefined;

		const listed = new Set<string>();
		let cursor: ChildNode | null = this.listEl.firstChild;
		for (const entry of entries) {
			listed.add(entry.path);
			const row = this.rows.get(entry.path) ?? this.mountRow(entry.path);
			if (grouped && (!group || group.color !== entry.color)) {
				group = { ...createGroupHeader(entry.color), color: entry.color, rows: [] };
				this.groups.push(group);
				this.listEl.insertBefore(group.el, cursor);
			}
			group?.rows.push(row);
			if (cursor === row.el) {
				cursor = row.el.nextSibling;
			} else {
				this.listEl.insertBefore(row.el, cursor);
			}
			this.syncFold(row, entry.path, entry.collapsed);
			setColorAttr(row.el, entry.color);
			setPreviewHeight(row.previewEl, entry.previewHeight);
		}

		for (const [path, row] of this.rows) {
			if (listed.has(path)) continue;
			this.unmountPreview(row);
			row.el.remove();
			this.rows.delete(path);
		}
		this.syncGroups();
		void this.applyFilter();
	}

	private setFilter(query: string): void {
		this.filterQuery = query.trim();
		void this.applyFilter();
	}

	private setColorFilter(colors: ReadonlySet<DeskColor>): void {
		this.colorFilter = colors;
		void this.applyFilter();
	}

	/** Hides the notes that don't match the search filter's text or the color filter's colors. */
	private async applyFilter(): Promise<void> {
		const pass = ++this.filterPass;
		const query = this.filterQuery;
		const colors = this.colorFilter;
		const colorByPath = new Map(this.store.entries.map((entry) => [entry.path, entry.color]));
		const rows = Array.from(this.rows);
		const matches = await Promise.all(
			rows.map(([path]) => {
				const color = colorByPath.get(path);
				if (colors.size > 0 && !(color && colors.has(color))) return Promise.resolve(false);
				return query ? noteMatchesFilter(this.app, path, query) : Promise.resolve(true);
			}),
		);
		if (pass !== this.filterPass) return;
		rows.forEach(([, row], index) => row.el.toggleClass('is-filtered-out', !matches[index]));
		const noneShown = rows.length > 0 && !matches.includes(true);
		this.noMatchesEl.toggleClass('is-hidden', !noneShown);
		this.syncGroups();
	}

	/** Counts the notes each group shows, hiding the header of a group the filters leave empty. */
	private syncGroups(): void {
		for (const group of this.groups) {
			const shown = group.rows.filter((row) => !row.el.hasClass('is-filtered-out')).length;
			group.countEl.setText(String(shown));
			group.el.toggleClass('is-hidden', shown === 0);
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

	/**
	 * `cqh` is a percent of the pane's height. The stylesheet reads this through a fallback, so a
	 * theme or snippet setting `--desk-card-max-height` still overrides the setting.
	 */
	private applyCardMaxHeight(): void {
		this.contentEl.setCssProps({ '--desk-card-height-setting': `${this.store.cardMaxHeight}cqh` });
	}

	/** Anything that isn't a Markdown note counts as missing, so no card ever renders one. */
	private fileForPath(path: string): TFile | null {
		const file = this.app.vault.getFileByPath(path);
		return isNoteFile(file) ? file : null;
	}
}
