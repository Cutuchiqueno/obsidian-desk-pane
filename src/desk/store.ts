import { Events } from 'obsidian';
import type { EventRef } from 'obsidian';
import type DeskPlugin from '../main';
import { colorLabel } from './color';
import {
	CARD_HEIGHT_DEFAULT,
	CARD_HEIGHT_MAX,
	CARD_HEIGHT_MIN,
	DESK_COLORS,
	entryKey,
	isNotePath,
} from './types';
import type { DeskChange, DeskColor, DeskEntry, DeskTarget, GroupNames } from './types';

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

	/** Percent of the pane's height; bounded here too, in case `data.json` was edited by hand. */
	get cardMaxHeight(): number {
		return bound(this.plugin.settings.cardMaxHeight);
	}

	/** Where the pane creates new notes; empty for the vault root. */
	get inboxFolder(): string {
		return this.plugin.settings.inboxFolder;
	}

	setCardMaxHeight(percent: number): void {
		const bounded = bound(percent);
		if (bounded === this.plugin.settings.cardMaxHeight) return;
		this.plugin.settings.cardMaxHeight = bounded;
		this.commit({ type: 'card-height' });
	}

	/** Cards are looked up by `entryKey`, which for a whole note is just its path. */
	indexOf(key: string): number {
		return this.entries.findIndex((entry) => entryKey(entry) === key);
	}

	has(key: string): boolean {
		return this.indexOf(key) >= 0;
	}

	get(key: string): DeskEntry | undefined {
		return this.entries[this.indexOf(key)];
	}

	/**
	 * Every card joins the desk through here or `addAllOnTop`, so the Markdown-only rule is enforced
	 * in these two for all of them.
	 */
	addOrMove(
		target: DeskTarget,
		targetIndex: number,
		collapsed = this.plugin.settings.defaultFolded,
	): void {
		const { path } = target;
		if (!isNotePath(path)) return;
		// An empty subpath is the whole note; `saveData` leaves an undefined one out of `data.json`.
		const entry: DeskEntry = { path, subpath: target.subpath || undefined, collapsed };
		const key = entryKey(entry);
		const isNew = !this.has(key);
		this.relocate(key, targetIndex, entry);
		this.commit({ type: isNew ? 'add' : 'move', key });
	}

	/** On top, where a new card without a color belongs. */
	addOnTop(target: DeskTarget): void {
		this.addOrMove(target, this.topIndex());
	}

	/**
	 * A note created from the pane is empty and open in the editor, so its card arrives folded. It
	 * goes on top, where a new note without a color belongs.
	 */
	addCreated(path: string): void {
		this.addOrMove({ path }, this.topIndex(), true);
	}

	/**
	 * Puts notes on top in the given order, as one change however many there are. Notes already on
	 * the desk keep their place. Returns how many were added.
	 */
	addAllOnTop(paths: string[]): number {
		const onDesk = new Set(this.entries.map(entryKey));
		const collapsed = this.plugin.settings.defaultFolded;
		const added = paths
			.filter((path) => isNotePath(path) && !onDesk.has(path))
			.map((path) => ({ path, collapsed }));
		if (added.length === 0) return 0;
		this.entries.splice(this.topIndex(), 0, ...added);
		this.commit({ type: 'add-all' });
		return added.length;
	}

	move(key: string, targetIndex: number): void {
		if (!this.has(key)) return;
		this.relocate(key, targetIndex);
		this.commit({ type: 'move', key });
	}

	/** Reorder by one step, for the context-menu fallback where dragging isn't available. */
	moveOffset(key: string, delta: number): void {
		const from = this.indexOf(key);
		if (from < 0) return;
		const to = from + delta;
		if (to < 0 || to >= this.entries.length) return;
		this.relocate(key, delta > 0 ? to + 1 : to);
		this.commit({ type: 'move', key });
	}

	remove(key: string): void {
		const index = this.indexOf(key);
		if (index < 0) return;
		this.entries.splice(index, 1);
		this.commit({ type: 'remove', key });
	}

	/** Takes every card of a note off the desk: the whole note's, and those of its headings and blocks. */
	removeNote(path: string): void {
		const kept = this.entries.filter((entry) => entry.path !== path);
		if (kept.length === this.entries.length) return;
		this.entries.splice(0, this.entries.length, ...kept);
		this.commit({ type: 'delete', path });
	}

	toggleFold(key: string): void {
		const entry = this.get(key);
		if (!entry) return;
		entry.collapsed = !entry.collapsed;
		this.commit({ type: 'fold', key });
	}

	setAllFolded(collapsed: boolean): void {
		this.setFolded(this.entries, collapsed);
	}

	/** Folds or unfolds the notes of one color, the block a group header heads while grouped. */
	setColorFolded(color: DeskColor | undefined, collapsed: boolean): void {
		this.setFolded(
			this.entries.filter((entry) => entry.color === color),
			collapsed,
		);
	}

	clear(): void {
		if (this.entries.length === 0) return;
		this.entries.splice(0);
		this.commit({ type: 'clear' });
	}

	/** All of a note's cards follow it; its headings and blocks keep their names inside it. */
	renamePath(oldPath: string, newPath: string): void {
		const renamed = this.entries.filter((entry) => entry.path === oldPath);
		if (renamed.length === 0) return;
		// Renaming a note to another file type, e.g. `.md` to `.base`, leaves nothing to show on a
		// card, so it comes off the desk the way a deleted note does.
		if (!isNotePath(newPath)) {
			this.removeNote(oldPath);
			return;
		}
		for (const entry of renamed) entry.path = newPath;
		this.commit({ type: 'rename', oldPath, newPath });
	}

	setColor(key: string, color: DeskColor | undefined): void {
		const entry = this.get(key);
		if (!entry || entry.color === color) return;
		entry.color = color;
		this.regroup();
		this.commit({ type: 'color', key });
	}

	/** `undefined` lets the preview fit its note again. */
	setPreviewHeight(key: string, height: number | undefined): void {
		const entry = this.get(key);
		if (!entry || entry.previewHeight === height) return;
		entry.previewHeight = height;
		this.commit({ type: 'resize', key });
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

	/** The name a group was given, if any. */
	groupName(color: DeskColor | undefined): string | undefined {
		return this.plugin.settings.groupNames[color ?? 'none'];
	}

	/** What the pane calls a color everywhere: its group's name, or else the color's own. */
	labelOf(color: DeskColor | undefined): string {
		return this.groupName(color) ?? colorLabel(color);
	}

	/**
	 * An empty name gives the group its color's name back. Names stay with their color, so a group
	 * that empties out has its name again when a note of that color returns.
	 */
	setGroupName(color: DeskColor | undefined, name: string): void {
		const trimmed = name.trim();
		if (trimmed === (this.groupName(color) ?? '')) return;
		// A copy rather than an edit, so the `{}` in the defaults is never written to.
		const names: GroupNames = { ...this.plugin.settings.groupNames };
		const key = color ?? 'none';
		if (trimmed) names[key] = trimmed;
		else delete names[key];
		this.plugin.settings.groupNames = names;
		this.commit({ type: 'group-name' });
	}

	private setFolded(entries: DeskEntry[], collapsed: boolean): void {
		const changed = entries.filter((entry) => entry.collapsed !== collapsed);
		if (changed.length === 0) return;
		for (const entry of changed) entry.collapsed = collapsed;
		this.commit({ type: 'fold-all' });
	}

	private uncolor(matches: (entry: DeskEntry) => boolean): void {
		const matching = this.entries.filter(matches);
		if (matching.length === 0) return;
		for (const entry of matching) entry.color = undefined;
		this.regroup();
		this.commit({ type: 'uncolor' });
	}

	/** The top of the desk, or while grouped the top of the notes without a color, so the grouping holds. */
	private topIndex(): number {
		if (!this.groupedByColor) return 0;
		const uncolored = this.entries.findIndex((entry) => !entry.color);
		return uncolored >= 0 ? uncolored : this.entries.length;
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
	private relocate(key: string, targetIndex: number, orNew?: DeskEntry): void {
		const entries = this.entries;
		const fromIndex = this.indexOf(key);
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

function bound(percent: number): number {
	if (!Number.isFinite(percent)) return CARD_HEIGHT_DEFAULT;
	return Math.min(Math.max(Math.round(percent), CARD_HEIGHT_MIN), CARD_HEIGHT_MAX);
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
