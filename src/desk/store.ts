import { Events } from 'obsidian';
import type { EventRef } from 'obsidian';
import type DeskPlugin from '../main';
import { DESK_COLORS } from './types';
import type { DeskChange, DeskColor, DeskEntry } from './types';

export class DeskStore extends Events {
	constructor(private plugin: DeskPlugin) {
		super();
	}

	onChange(callback: (change: DeskChange) => void): EventRef {
		return this.on('changed', (...data: unknown[]) => callback(data[0] as DeskChange));
	}

	get entries(): DeskEntry[] {
		return this.plugin.settings.entries;
	}

	get groupedByColor(): boolean {
		return this.plugin.settings.groupedByColor;
	}

	indexOf(path: string): number {
		return this.entries.findIndex((entry) => entry.path === path);
	}

	has(path: string): boolean {
		return this.indexOf(path) >= 0;
	}

	addOrMove(path: string, targetIndex: number): void {
		const isNew = !this.has(path);
		this.relocate(path, targetIndex, {
			path,
			collapsed: this.plugin.settings.defaultFolded,
		});
		this.commit({ type: isNew ? 'add' : 'move', path });
	}

	move(path: string, targetIndex: number): void {
		if (!this.has(path)) return;
		this.relocate(path, targetIndex);
		this.commit({ type: 'move', path });
	}

	/** Reorder by one step, for the context-menu fallback where dragging isn't available. */
	moveOffset(path: string, delta: number): void {
		const from = this.indexOf(path);
		if (from < 0) return;
		const to = from + delta;
		if (to < 0 || to >= this.entries.length) return;
		this.relocate(path, delta > 0 ? to + 1 : to);
		this.commit({ type: 'move', path });
	}

	removeByPath(path: string): void {
		const index = this.indexOf(path);
		if (index < 0) return;
		this.entries.splice(index, 1);
		this.commit({ type: 'remove', path });
	}

	toggleFold(path: string): void {
		const entry = this.entries[this.indexOf(path)];
		if (!entry) return;
		entry.collapsed = !entry.collapsed;
		this.commit({ type: 'fold', path });
	}

	setAllFolded(collapsed: boolean): void {
		const changed = this.entries.filter((entry) => entry.collapsed !== collapsed);
		if (changed.length === 0) return;
		for (const entry of changed) entry.collapsed = collapsed;
		this.commit({ type: 'fold-all' });
	}

	clear(): void {
		if (this.entries.length === 0) return;
		this.entries.splice(0);
		this.commit({ type: 'clear' });
	}

	renamePath(oldPath: string, newPath: string): void {
		const entry = this.entries[this.indexOf(oldPath)];
		if (!entry) return;
		entry.path = newPath;
		this.commit({ type: 'rename', oldPath, newPath });
	}

	setColor(path: string, color: DeskColor | undefined): void {
		const entry = this.entries[this.indexOf(path)];
		if (!entry || entry.color === color) return;
		entry.color = color;
		this.regroup();
		this.commit({ type: 'color', path });
	}

	/** `undefined` lets the preview fit its note again. */
	setPreviewHeight(path: string, height: number | undefined): void {
		const entry = this.entries[this.indexOf(path)];
		if (!entry || entry.previewHeight === height) return;
		entry.previewHeight = height;
		this.commit({ type: 'resize', path });
	}

	clearColor(color: DeskColor): void {
		this.uncolor((entry) => entry.color === color);
	}

	clearAllColors(): void {
		this.uncolor((entry) => entry.color !== undefined);
	}

	/** Grouping sorts the notes into one block per color, which the pane shows under headers. */
	setGroupedByColor(grouped: boolean): void {
		if (grouped === this.groupedByColor) return;
		if (grouped && !this.entries.some((entry) => entry.color)) return;
		this.plugin.settings.groupedByColor = grouped;
		this.regroup();
		this.commit({ type: 'group' });
	}

	private uncolor(matches: (entry: DeskEntry) => boolean): void {
		const matching = this.entries.filter(matches);
		if (matching.length === 0) return;
		for (const entry of matching) entry.color = undefined;
		this.regroup();
		this.commit({ type: 'uncolor' });
	}

	/** While grouped, a note whose color changes moves into the block of its new color. */
	private regroup(): void {
		// `sort` is stable, so the notes of a block keep their order.
		if (this.groupedByColor) this.entries.sort((a, b) => colorRank(a) - colorRank(b));
	}

	/**
	 * `targetIndex` is an insertion point in the list as it looks *before* the entry is pulled
	 * out, so a drop indicator's position maps to it directly.
	 */
	private relocate(path: string, targetIndex: number, orNew?: DeskEntry): void {
		const entries = this.entries;
		const fromIndex = this.indexOf(path);
		const bounded = Math.max(0, Math.min(targetIndex, entries.length));
		const entry = fromIndex >= 0 ? entries.splice(fromIndex, 1)[0] : orNew;
		if (!entry) return;
		const adjusted = fromIndex >= 0 && fromIndex < bounded ? bounded - 1 : bounded;
		entries.splice(adjusted, 0, entry);
	}

	private commit(change: DeskChange): void {
		// A change that leaves a note outside its color's block, like dragging it away, ends grouping.
		if (this.groupedByColor && !isInColorBlocks(this.entries)) {
			this.plugin.settings.groupedByColor = false;
		}
		void this.plugin.saveData(this.plugin.settings);
		this.trigger('changed', change);
	}
}

/** Palette order, with the notes that have no color last. */
function colorRank(entry: DeskEntry): number {
	return entry.color ? DESK_COLORS.indexOf(entry.color) : DESK_COLORS.length;
}

function isInColorBlocks(entries: DeskEntry[]): boolean {
	let previousRank = -Infinity;
	for (const entry of entries) {
		const rank = colorRank(entry);
		if (rank < previousRank) return false;
		previousRank = rank;
	}
	return entries.some((entry) => entry.color);
}
