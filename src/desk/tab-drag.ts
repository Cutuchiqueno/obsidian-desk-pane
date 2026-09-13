import { MarkdownView } from 'obsidian';
import type { Plugin, TFile, WorkspaceLeaf } from 'obsidian';

type OnDragLeaf = (evt: DragEvent, leaf: WorkspaceLeaf) => unknown;
type GetDropLocation = (evt: DragEvent) => unknown;

/** Private workspace methods behind tab drag and drop — not part of Obsidian's public API. */
interface WorkspaceDragInternals {
	onDragLeaf?: OnDragLeaf;
	getDropLocation?: GetDropLocation;
}

interface ActiveTabDrag {
	leaf: WorkspaceLeaf;
	sourceEl: EventTarget;
}

/**
 * Obsidian drags tabs with private workspace code: the dragged tab never reaches `DataTransfer`, and
 * a window-level drop handler docks the tab wherever `getDropLocation` points, ignoring any drop
 * handler underneath. Hooking those two methods lets a Desk pane take a tab's note instead.
 */
export class TabDrag {
	private active: ActiveTabDrag | null = null;
	private installed = false;

	constructor(private readonly plugin: Plugin) {}

	get inProgress(): boolean {
		return this.active !== null;
	}

	/** The note shown in the dragged tab, if it is a Markdown note. */
	get note(): TFile | null {
		const view = this.active?.leaf.view;
		return view instanceof MarkdownView && view.file?.extension === 'md' ? view.file : null;
	}

	/** Closes the dragged tab once Obsidian has finished handling the end of the drag. */
	closeTabWhenDragEnds(): void {
		const active = this.active;
		active?.sourceEl.addEventListener('dragend', () => active.leaf.detach(), { once: true });
	}

	install(): void {
		const workspace = this.plugin.app.workspace as unknown as WorkspaceDragInternals;
		const { onDragLeaf, getDropLocation } = workspace;
		if (typeof onDragLeaf !== 'function' || typeof getDropLocation !== 'function') return;
		this.installed = true;
		this.plugin.register(() => (this.installed = false));
		// Runs before the tab's own dragstart, so a drag whose dragend got lost can't linger into the next.
		this.plugin.registerDomEvent(window, 'dragstart', () => (this.active = null), { capture: true });

		this.patch(workspace, 'onDragLeaf', onDragLeaf, (evt, leaf) => {
			const result = onDragLeaf.call(workspace, evt, leaf);
			// Obsidian cancels tab drags on phones by preventing the dragstart.
			if (this.installed && !evt.defaultPrevented) this.track(evt, leaf);
			return result;
		});
		this.patch(workspace, 'getDropLocation', getDropLocation, (evt) =>
			this.installed && this.isNoteOverDesk(evt) ? null : getDropLocation.call(workspace, evt),
		);
	}

	private track(evt: DragEvent, leaf: WorkspaceLeaf): void {
		const sourceEl = evt.target;
		if (!sourceEl) return;
		const active = { leaf, sourceEl };
		this.active = active;
		sourceEl.addEventListener(
			'dragend',
			() => {
				if (this.active === active) this.active = null;
			},
			{ once: true },
		);
	}

	private isNoteOverDesk(evt: DragEvent): boolean {
		return (
			this.note !== null &&
			evt.target instanceof Element &&
			evt.target.closest('.desk-view') !== null
		);
	}

	private patch<K extends keyof WorkspaceDragInternals>(
		workspace: WorkspaceDragInternals,
		key: K,
		original: NonNullable<WorkspaceDragInternals[K]>,
		replacement: NonNullable<WorkspaceDragInternals[K]>,
	): void {
		const hadOwnProperty = Object.prototype.hasOwnProperty.call(workspace, key);
		workspace[key] = replacement;
		this.plugin.register(() => {
			// Another plugin may have wrapped ours since; our wrapper then stays in its chain as a no-op.
			if (workspace[key] !== replacement) return;
			if (hadOwnProperty) workspace[key] = original;
			else delete workspace[key];
		});
	}
}
