import { Component, ItemView, Keymap, MarkdownRenderer, Menu, setIcon } from 'obsidian';
import type { TFile, WorkspaceLeaf } from 'obsidian';
import { editColorName, setColorAttr, showColorMenu } from './color';
import { DeskDragController } from './desk-drag';
import { DeskResizeController } from './desk-resize';
import { targetMatchesFilter } from './filter';
import { addInboxNotes } from './inbox';
import { hasPart, openState, partTitle, readTargetMarkdown } from './note-part';
import {
	createGroupHeader,
	createRow,
	setGroupFoldButton,
	setPreviewHeight,
	setRowTitle,
} from './row';
import type { DeskRow, GroupHeader } from './row';
import type { DeskStore } from './store';
import type { TabDrag } from './tab-drag';
import { DeskToolbar } from './toolbar';
import { DESK_ICON, entryKey, isNoteFile, VIEW_TYPE_DESK } from './types';
import type { DeskChange, DeskColor, DeskEntry, DeskTarget } from './types';

interface MountedRow extends DeskRow {
	preview: Component | null;
	/** Whether the preview says its heading or block is gone, rather than showing it. */
	partMissing: boolean;
	/** Bumped on every title update, as `filterPass` is for the filter. */
	titlePass: number;
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
	/** By `entryKey`, so a note can have a row of its own besides those of its headings and blocks. */
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
		const inboxLinkEl = this.emptyEl.createEl('a', {
			cls: 'desk-empty-action',
			text: 'Add notes from inbox',
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
		this.registerDomEvent(inboxLinkEl, 'click', () => addInboxNotes(this.app, this.store));
		this.registerDomEvent(this.listEl, 'click', (event) => this.onClick(event));
		this.registerDomEvent(this.listEl, 'contextmenu', (event) => this.onContextMenu(event));
		this.registerEvent(this.store.onChange((change) => this.render(change)));
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (this.filterQuery && this.isOnDesk(file.path)) void this.applyFilter();
			}),
		);
		// Comes after `modify`, once Obsidian has found the note's headings and blocks again.
		this.registerEvent(this.app.metadataCache.on('changed', (file) => this.refreshParts(file.path)));
		this.render();
	}

	protected override async onClose(): Promise<void> {
		this.rows.clear();
		this.groups = [];
		this.contentEl.empty();
	}

	private onClick(event: MouseEvent): void {
		const target = event.target instanceof Element ? event.target : null;
		const headerEl = target?.closest('.desk-group-header');
		const group = headerEl && this.groups.find((candidate) => candidate.el === headerEl);
		if (group) {
			if (target?.closest('.desk-group-fold')) {
				this.store.setColorFolded(group.color, anyUnfolded(group));
			} else if (target?.closest('.desk-group-title')) {
				editColorName(group.titleEl, group.color, (name) =>
					this.store.setGroupName(group.color, name),
				);
			}
			return;
		}
		const key = this.keyFromEvent(event);
		if (!key) return;
		if (target?.closest('.desk-item-remove')) {
			this.store.remove(key);
		} else if (target?.closest('.desk-item-color')) {
			showColorMenu(
				event,
				this.store.get(key)?.color,
				(color) => this.store.labelOf(color),
				(color) => this.store.setColor(key, color),
			);
		} else if (target?.closest('.desk-item-header')) {
			// Clicks inside a preview are left alone, for selecting text and following links.
			this.store.toggleFold(key);
		}
	}

	private onContextMenu(event: MouseEvent): void {
		const key = this.keyFromEvent(event);
		if (!key) return;
		const index = this.store.indexOf(key);
		const entry = this.store.entries[index];
		if (!entry) return;
		event.preventDefault();

		const menu = new Menu();
		const file = this.fileForPath(entry.path);
		menu.addItem((item) =>
			item
				.setTitle('Open note')
				.setIcon('file-text')
				.setDisabled(!file)
				.onClick(() => {
					if (!file) return;
					const leaf = this.app.workspace.getLeaf(Keymap.isModEvent(event));
					void leaf.openFile(file, openState(entry));
				}),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle('Move up')
				.setIcon('arrow-up')
				.setDisabled(index === 0)
				.onClick(() => this.store.moveOffset(key, -1)),
		);
		menu.addItem((item) =>
			item
				.setTitle('Move down')
				.setIcon('arrow-down')
				.setDisabled(index === this.store.entries.length - 1)
				.onClick(() => this.store.moveOffset(key, 1)),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle('Reset height')
				.setIcon('unfold-vertical')
				.setDisabled(entry.previewHeight === undefined)
				.onClick(() => this.store.setPreviewHeight(key, undefined)),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle('Remove from desk')
				.setIcon('x')
				.onClick(() => this.store.remove(key)),
		);
		menu.showAtMouseEvent(event);
	}

	private render(change?: DeskChange): void {
		if (change?.type === 'card-height') {
			this.applyCardMaxHeight();
			return;
		}
		if (change?.type === 'rename') {
			this.relabelRows(change.oldPath, change.newPath);
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
			const key = entryKey(entry);
			listed.add(key);
			const row = this.rows.get(key) ?? this.mountRow(entry);
			if (grouped && (!group || group.color !== entry.color)) {
				group = {
					...createGroupHeader(entry.color, this.store.labelOf(entry.color)),
					color: entry.color,
					rows: [],
				};
				this.groups.push(group);
				this.listEl.insertBefore(group.el, cursor);
			}
			group?.rows.push(row);
			if (cursor === row.el) {
				cursor = row.el.nextSibling;
			} else {
				this.listEl.insertBefore(row.el, cursor);
			}
			this.syncFold(row, entry);
			setColorAttr(row.el, entry.color);
			setPreviewHeight(row.previewEl, entry.previewHeight);
		}

		for (const [key, row] of this.rows) {
			if (listed.has(key)) continue;
			this.unmountPreview(row);
			row.el.remove();
			this.rows.delete(key);
		}
		for (const group of this.groups) setGroupFoldButton(group.foldEl, anyUnfolded(group));
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

	/** Hides the cards that don't match the search filter's text or the color filter's colors. */
	private async applyFilter(): Promise<void> {
		const pass = ++this.filterPass;
		const query = this.filterQuery;
		const colors = this.colorFilter;
		const entryByKey = new Map(this.store.entries.map((entry) => [entryKey(entry), entry]));
		const rows = Array.from(this.rows);
		const matches = await Promise.all(
			rows.map(([key]) => {
				const entry = entryByKey.get(key);
				if (!entry) return Promise.resolve(false);
				const color = entry.color;
				if (colors.size > 0 && !(color && colors.has(color))) return Promise.resolve(false);
				return query ? targetMatchesFilter(this.app, entry, query) : Promise.resolve(true);
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

	private mountRow(entry: DeskEntry): MountedRow {
		const key = entryKey(entry);
		const row: MountedRow = {
			...createRow(this.listEl, key, true),
			preview: null,
			partMissing: false,
			titlePass: 0,
		};
		void this.titleRow(row, entry);
		this.rows.set(key, row);
		return row;
	}

	/** Every card of a renamed note follows it, keeping its heading or block. */
	private relabelRows(oldPath: string, newPath: string): void {
		for (const entry of this.store.entries) {
			if (entry.path !== newPath) continue;
			const oldKey = entryKey({ path: oldPath, subpath: entry.subpath });
			const row = this.rows.get(oldKey);
			if (!row) continue;
			const key = entryKey(entry);
			this.rows.delete(oldKey);
			this.rows.set(key, row);
			row.el.dataset.key = key;
			void this.titleRow(row, entry);
		}
	}

	/**
	 * A heading or block can be renamed, edited, or deleted, or found only once Obsidian has indexed
	 * its note: its cards' titles follow, and a preview that said it was gone, or showed it until it
	 * went, is rendered again.
	 */
	private refreshParts(path: string): void {
		const file = this.fileForPath(path);
		for (const entry of this.store.entries) {
			if (entry.path !== path || !entry.subpath) continue;
			const row = this.rows.get(entryKey(entry));
			if (!row) continue;
			void this.titleRow(row, entry);
			const exists = file !== null && hasPart(this.app, file, entry.subpath);
			if (row.preview && row.partMissing === exists) {
				this.unmountPreview(row);
				void this.mountPreview(row, entry);
			}
		}
	}

	/** A heading's card is named after it, a block's after its first words, which takes a read. */
	private async titleRow(row: MountedRow, target: DeskTarget): Promise<void> {
		const pass = ++row.titlePass;
		const file = this.fileForPath(target.path);
		const { subpath } = target;
		const exists = file !== null && (!subpath || hasPart(this.app, file, subpath));
		const part = subpath ? await partTitle(this.app, file, subpath) : undefined;
		if (pass !== row.titlePass) return;
		setRowTitle(row, target.path, part, exists);
	}

	private syncFold(row: MountedRow, entry: DeskEntry): void {
		row.el.classList.toggle('is-collapsed', entry.collapsed);
		if (entry.collapsed) {
			this.unmountPreview(row);
		} else if (!row.preview) {
			void this.mountPreview(row, entry);
		}
	}

	private async mountPreview(row: MountedRow, target: DeskTarget): Promise<void> {
		const file = this.fileForPath(target.path);
		if (!file) return;
		const preview = new Component();
		this.addChild(preview);
		row.preview = preview;

		const markdown = await readTargetMarkdown(this.app, file, target.subpath);
		if (row.preview !== preview) return;
		row.previewEl.empty();
		row.partMissing = markdown === null;
		if (markdown === null) {
			row.previewEl.createDiv({
				cls: 'desk-item-part-missing',
				text: target.subpath?.startsWith('#^')
					? 'This block is no longer in the note.'
					: 'This heading is no longer in the note.',
			});
			return;
		}
		await MarkdownRenderer.render(this.app, markdown, row.previewEl, file.path, preview);
	}

	private unmountPreview(row: MountedRow): void {
		if (!row.preview) return;
		this.removeChild(row.preview);
		row.preview = null;
		row.partMissing = false;
		row.previewEl.empty();
	}

	private keyFromEvent(event: Event): string | null {
		if (!(event.target instanceof Element)) return null;
		return event.target.closest<HTMLElement>('.desk-item')?.dataset.key ?? null;
	}

	private isOnDesk(path: string): boolean {
		return this.store.entries.some((entry) => entry.path === path);
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

/** Counts the notes the filters hide too, as the toolbar's **Collapse all** does. */
function anyUnfolded(group: MountedGroup): boolean {
	return group.rows.some((row) => !row.el.hasClass('is-collapsed'));
}
