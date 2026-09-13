export const VIEW_TYPE_DESK = 'desk-view';

export const DESK_ICON = 'panel-right';

/** Carries the path of a note dragged out of the Desk list, telling it apart from other drags. */
export const DESK_ENTRY_MIME = 'application/x-desk-entry';

export interface DeskEntry {
	path: string;
	collapsed: boolean;
}

export type DeskChange =
	| { type: 'add' | 'remove' | 'move' | 'fold'; path: string }
	| { type: 'rename'; oldPath: string; newPath: string };
