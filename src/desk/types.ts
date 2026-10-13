import { TFile } from 'obsidian';
import type { TAbstractFile } from 'obsidian';

export const VIEW_TYPE_DESK = 'desk-sidebar-view';

export const DESK_ICON = 'panel-right';

/** Carries the key of a card dragged out of the Desk list, telling it apart from other drags. */
export const DESK_ENTRY_MIME = 'application/x-desk-sidebar-entry';

/**
 * Only Markdown notes belong on the desk: a card renders its note as Markdown, which Obsidian's
 * other file types — `.base`, `.canvas`, PDFs, images — are not. Every way onto the desk goes
 * through one of these two checks.
 */
export function isNoteFile(file: TAbstractFile | null | undefined): file is TFile {
	return file instanceof TFile && file.extension === 'md';
}

/** The same rule for a stored path, which may point at a note that no longer exists. */
export function isNotePath(path: string): boolean {
	return path.toLowerCase().endsWith('.md');
}

/**
 * How tall a card may grow, as a percentage of the pane's height — the **Maximum card height**
 * setting. A card fits its note below that and scrolls its preview beyond it.
 */
export const CARD_HEIGHT_MIN = 20;
export const CARD_HEIGHT_MAX = 100;
export const CARD_HEIGHT_DEFAULT = 50;

/** Obsidian's named theme colors, in the order grouping sorts them. */
export const DESK_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const;

export type DeskColor = (typeof DESK_COLORS)[number];

/** Names given to groups, by their color, or `none` for the notes without one. */
export type GroupNames = Partial<Record<DeskColor | 'none', string>>;

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

export type DeskChange =
	| { type: 'add' | 'remove' | 'move' | 'fold' | 'color' | 'resize'; key: string }
	/** A note left the vault, or stopped being Markdown, taking all of its cards with it. */
	| { type: 'delete'; path: string }
	| { type: 'rename'; oldPath: string; newPath: string }
	| { type: 'add-all' | 'fold-all' | 'clear' | 'uncolor' | 'group' | 'group-name' | 'card-height' };
