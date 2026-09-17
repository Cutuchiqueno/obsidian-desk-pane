import { TFile } from 'obsidian';
import type { TAbstractFile } from 'obsidian';

export const VIEW_TYPE_DESK = 'desk-sidebar-view';

export const DESK_ICON = 'panel-right';

/** Carries the path of a note dragged out of the Desk list, telling it apart from other drags. */
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

/** Obsidian's named theme colors, in the order grouping sorts them. */
export const DESK_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const;

export type DeskColor = (typeof DESK_COLORS)[number];

export interface DeskEntry {
	path: string;
	collapsed: boolean;
	color?: DeskColor;
	/** Pixels, from dragging the card's bottom edge; without it, the preview fits its note. */
	previewHeight?: number;
}

export type DeskChange =
	| { type: 'add' | 'remove' | 'move' | 'fold' | 'color' | 'resize'; path: string }
	| { type: 'rename'; oldPath: string; newPath: string }
	| { type: 'fold-all' | 'clear' | 'uncolor' | 'group' };
