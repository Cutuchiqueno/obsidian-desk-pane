export const VIEW_TYPE_DESK = 'desk-view';

export const DESK_ICON = 'panel-right';

/** Carries the path of a note dragged out of the Desk list, telling it apart from other drags. */
export const DESK_ENTRY_MIME = 'application/x-desk-entry';

/** Obsidian's named theme colors, in the order grouping sorts them. */
export const DESK_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const;

export type DeskColor = (typeof DESK_COLORS)[number];

export interface DeskEntry {
	path: string;
	collapsed: boolean;
	color?: DeskColor;
}

export type DeskChange =
	| { type: 'add' | 'remove' | 'move' | 'fold' | 'color'; path: string }
	| { type: 'rename'; oldPath: string; newPath: string }
	| { type: 'fold-all' | 'clear' | 'uncolor' | 'group' };
