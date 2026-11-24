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

// The data model lives in `model.ts`, free of Obsidian imports so the sync modules can be tested.
export {
	DESK_COLORS,
	GROUP_NAME_KEYS,
	colorRank,
	entryKey,
	isDeskColor,
	isInColorBlocks,
} from './model';
export type { DeskColor, DeskEntry, DeskTarget, GroupNames } from './model';

export type DeskChange =
	/**
	 * `add` comes from every deliberate gesture that puts a card on the desk, also when the card is
	 * already there and only moves: with sync on, it puts the card back if another device took it off.
	 */
	| { type: 'add' | 'remove' | 'move' | 'fold' | 'color' | 'resize'; key: string }
	/** A note left the vault, or stopped being Markdown, taking all of its cards with it. */
	| { type: 'delete'; path: string }
	| { type: 'rename'; oldPath: string; newPath: string }
	| { type: 'add-all' | 'fold-all' | 'clear' | 'uncolor' | 'group' | 'group-name' | 'card-height' }
	/** A setting the desk keeps in step across devices changed: folding new notes, the inbox folder. */
	| { type: 'prefs' }
	/** The desk took in what other devices changed; the pane renders it all anew. */
	| { type: 'sync' };
