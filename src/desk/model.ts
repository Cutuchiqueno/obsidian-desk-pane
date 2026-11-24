/**
 * The desk's data model, free of any import from `obsidian`, so the sync modules built on it can be
 * bundled and tested outside the app. `types.ts` re-exports all of it.
 */

/** Obsidian's named theme colors, in the order grouping sorts them. */
export const DESK_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const;

export type DeskColor = (typeof DESK_COLORS)[number];

/** Names given to groups, by their color, or `none` for the notes without one. */
export type GroupNames = Partial<Record<DeskColor | 'none', string>>;

/** The keys of `GroupNames`: every color, then the group of notes without one. */
export const GROUP_NAME_KEYS: readonly (DeskColor | 'none')[] = [...DESK_COLORS, 'none'];

/** What a card shows: a whole note, or one heading or block of it. */
export interface DeskTarget {
	path: string;
	/** `#Heading` or `#^blockid`, as in a link; without it, the card shows the whole note. */
	subpath?: string;
}

export interface DeskEntry extends DeskTarget {
	collapsed: boolean;
	color?: DeskColor;
	/** Pixels, from dragging the card's bottom edge; without it, the preview fits its note. */
	previewHeight?: number;
}

/**
 * Tells cards apart, in the link form `Note.md#Heading`. A note can be on the desk once as a whole,
 * where the key is its path, and once more for each of its headings and blocks.
 */
export function entryKey(target: DeskTarget): string {
	return target.subpath ? `${target.path}${target.subpath}` : target.path;
}

export function isDeskColor(value: unknown): value is DeskColor {
	return typeof value === 'string' && (DESK_COLORS as readonly string[]).includes(value);
}

/** Palette order, with the notes that have no color last. */
export function colorRank(entry: { color?: DeskColor }): number {
	return entry.color ? DESK_COLORS.indexOf(entry.color) : DESK_COLORS.length;
}

/** Whether the notes form one block per color in palette order, with at least one colored note. */
export function isInColorBlocks(entries: readonly { color?: DeskColor }[]): boolean {
	let previousRank = -Infinity;
	for (const entry of entries) {
		const rank = colorRank(entry);
		if (rank < previousRank) return false;
		previousRank = rank;
	}
	return entries.some((entry) => entry.color);
}
