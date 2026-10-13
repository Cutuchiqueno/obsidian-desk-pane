import type { App } from 'obsidian';
import { readTargetMarkdown } from './note-part';
import { basename } from './row';
import type { DeskTarget } from './types';

/**
 * Whether a card's note title or text contains `query`, ignoring case. A heading's or block's card
 * matches only on the text it shows.
 */
export async function targetMatchesFilter(
	app: App,
	target: DeskTarget,
	query: string,
): Promise<boolean> {
	const needle = query.toLowerCase();
	if (basename(target.path).toLowerCase().includes(needle)) return true;
	const file = app.vault.getFileByPath(target.path);
	if (!file) return false;
	const text = await readTargetMarkdown(app, file, target.subpath);
	return text?.toLowerCase().includes(needle) ?? false;
}
