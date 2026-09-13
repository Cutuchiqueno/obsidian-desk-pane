import { Component } from 'obsidian';
import type { App, TFile, WorkspaceLeaf } from 'obsidian';
import { resolveDroppedFiles } from './drop-resolve';
import { computeInsertionIndex, hideIndicator, showIndicator } from './insertion';
import type { DeskStore } from './store';
import type { TabDrag } from './tab-drag';
import { DESK_ENTRY_MIME } from './types';

interface RowDrag {
	path: string;
	rowEl: HTMLElement;
	openedInTab: boolean;
}

interface EditorDropTarget {
	file: TFile;
	leaf: WorkspaceLeaf;
	groupEl: HTMLElement;
}

/** Private drag manager methods that draw Obsidian's own drop highlight. */
interface DropOverlay {
	showOverlay?(doc: Document, rect: DOMRect): void;
	hideOverlay?(): void;
}

/**
 * Drag and drop for one Desk pane: notes and tabs dropped onto the pane join the list, rows dragged
 * within it reorder it, and rows dropped onto the main editor area open as tabs and leave the list.
 */
export class DeskDragController extends Component {
	private rowDrag: RowDrag | null = null;
	private readonly indicatorEl = createDiv({ cls: 'desk-drop-indicator' });

	constructor(
		private readonly app: App,
		private readonly paneEl: HTMLElement,
		private readonly listEl: HTMLElement,
		private readonly store: DeskStore,
		private readonly tabDrag: TabDrag,
	) {
		super();
	}

	override onload(): void {
		this.registerDomEvent(this.listEl, 'dragstart', (evt) => this.onRowDragStart(evt));
		this.registerDomEvent(this.listEl, 'dragend', () => this.onRowDragEnd());
		this.registerDomEvent(this.paneEl, 'dragenter', (evt) => this.onPaneDragOver(evt));
		this.registerDomEvent(this.paneEl, 'dragover', (evt) => this.onPaneDragOver(evt));
		this.registerDomEvent(this.paneEl, 'dragleave', (evt) => this.onPaneDragLeave(evt));
		this.registerDomEvent(this.paneEl, 'drop', (evt) => this.onPaneDrop(evt));
		// Capture phase, so the editor never sees a Desk note dropped on it and inserts a link instead.
		const capture = { capture: true };
		// Also runs before a row's own dragstart: a drag whose row was re-rendered away never got its dragend.
		this.registerDomEvent(document, 'dragstart', () => (this.rowDrag = null), capture);
		this.registerDomEvent(document, 'dragenter', (evt) => this.onEditorDragOver(evt), capture);
		this.registerDomEvent(document, 'dragover', (evt) => this.onEditorDragOver(evt), capture);
		this.registerDomEvent(document, 'drop', (evt) => this.onEditorDrop(evt), capture);
	}

	private onRowDragStart(evt: DragEvent): void {
		// Links and text inside an unfolded preview are draggable in their own right; only a drag that
		// starts on the header moves the note.
		const headerEl = evt.target instanceof Element ? evt.target.closest('.desk-item-header') : null;
		const rowEl = headerEl?.closest<HTMLElement>('.desk-item');
		const path = rowEl?.dataset.path;
		if (!rowEl || !path || !evt.dataTransfer) return;
		evt.dataTransfer.setData(DESK_ENTRY_MIME, path);
		evt.dataTransfer.effectAllowed = 'move';
		rowEl.addClass('is-dragging');
		this.rowDrag = { path, rowEl, openedInTab: false };
	}

	private onRowDragEnd(): void {
		const drag = this.rowDrag;
		this.rowDrag = null;
		hideIndicator(this.indicatorEl);
		if (!drag) return;
		drag.rowEl.removeClass('is-dragging');
		// Removed only now, so the row is still in place while Obsidian finishes the drag.
		if (drag.openedInTab) this.store.removeByPath(drag.path);
	}

	private onPaneDragOver(evt: DragEvent): void {
		const effect = this.paneDropEffect(evt.dataTransfer);
		if (!effect || !evt.dataTransfer) return;
		evt.preventDefault();
		// Obsidian's window-level tab handler would reset the drop effect to "none". It still receives
		// dragenter, where it clears its docking overlay because it finds no drop location over a Desk.
		if (this.tabDrag.inProgress && evt.type === 'dragover') evt.stopPropagation();
		evt.dataTransfer.dropEffect = effect;
		const { targetRowEl } = computeInsertionIndex(this.listEl, evt.clientY);
		showIndicator(this.listEl, this.indicatorEl, targetRowEl);
	}

	private onPaneDragLeave(evt: DragEvent): void {
		const leftTo = evt.relatedTarget;
		if (leftTo instanceof Node && this.paneEl.contains(leftTo)) return;
		hideIndicator(this.indicatorEl);
	}

	private onPaneDrop(evt: DragEvent): void {
		const dataTransfer = evt.dataTransfer;
		if (!dataTransfer || !this.paneDropEffect(dataTransfer)) return;
		// Claimed even when nothing resolves, so the sidebar leaf underneath doesn't open the file itself.
		evt.preventDefault();
		const { index } = computeInsertionIndex(this.listEl, evt.clientY);
		hideIndicator(this.indicatorEl);

		const tabNote = this.tabDrag.note;
		if (tabNote) {
			this.store.addOrMove(tabNote.path, index);
			this.tabDrag.closeTabWhenDragEnds();
		} else if (dataTransfer.types.includes(DESK_ENTRY_MIME)) {
			this.store.move(dataTransfer.getData(DESK_ENTRY_MIME), index);
		} else {
			resolveDroppedFiles(dataTransfer, this.app).forEach((file, offset) =>
				this.store.addOrMove(file.path, index + offset),
			);
		}
	}

	private paneDropEffect(dataTransfer: DataTransfer | null): 'move' | 'copy' | null {
		// Tabs that don't show a note are left to Obsidian, which docks them in the sidebar.
		if (this.tabDrag.inProgress) return this.tabDrag.note ? 'move' : null;
		const types = dataTransfer?.types ?? [];
		if (types.includes(DESK_ENTRY_MIME)) return 'move';
		if (types.includes('text/plain')) return 'copy';
		return null;
	}

	private onEditorDragOver(evt: DragEvent): void {
		const target = this.editorDropTarget(evt);
		if (!target || !evt.dataTransfer) return;
		evt.preventDefault();
		evt.stopPropagation();
		evt.dataTransfer.dropEffect = 'move';
		this.dropOverlay()?.showOverlay?.(target.groupEl.doc, target.groupEl.getBoundingClientRect());
	}

	private onEditorDrop(evt: DragEvent): void {
		const target = this.editorDropTarget(evt);
		if (!target || !this.rowDrag) return;
		evt.preventDefault();
		evt.stopPropagation();
		this.dropOverlay()?.hideOverlay?.();
		this.rowDrag.openedInTab = true;
		void openInNewTab(this.app, target.leaf, target.file);
	}

	/** The main-area tab group under the pointer while one of this pane's notes is being dragged. */
	private editorDropTarget(evt: DragEvent): EditorDropTarget | null {
		const el = evt.target;
		if (!this.rowDrag || !(el instanceof Element) || el.closest('.desk-view')) return null;
		const groupEl = el.closest<HTMLElement>('.workspace-tabs');
		const file = this.app.vault.getFileByPath(this.rowDrag.path);
		if (!groupEl || !file) return null;
		const leaf = rootLeafAt(this.app, el, groupEl);
		return leaf ? { file, leaf, groupEl } : null;
	}

	private dropOverlay(): DropOverlay | undefined {
		return (this.app as unknown as { dragManager?: DropOverlay }).dragManager;
	}
}

/** The main-area leaf under `el`; over a tab bar, the tab that group is currently showing. */
function rootLeafAt(app: App, el: Element, groupEl: HTMLElement): WorkspaceLeaf | null {
	const leaves: WorkspaceLeaf[] = [];
	app.workspace.iterateRootLeaves((leaf) => {
		leaves.push(leaf);
	});
	return (
		leaves.find((leaf) => leaf.view.containerEl.contains(el)) ??
		leaves.find((leaf) => {
			const viewEl = leaf.view.containerEl;
			return groupEl.contains(viewEl) && viewEl.isShown();
		}) ??
		null
	);
}

async function openInNewTab(app: App, besideLeaf: WorkspaceLeaf, file: TFile): Promise<void> {
	if (besideLeaf.view.getViewType() === 'empty') {
		await besideLeaf.openFile(file, { active: true });
		return;
	}
	app.workspace.setActiveLeaf(besideLeaf, { focus: false });
	await app.workspace.getLeaf('tab').openFile(file, { active: true });
}
