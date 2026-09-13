import type { App } from 'obsidian';
import { basename } from './row';

/** Whether a desk note's title or text contains `query`, ignoring case. */
export async function noteMatchesFilter(app: App, path: string, query: string): Promise<boolean> {
	const needle = query.toLowerCase();
	if (basename(path).toLowerCase().includes(needle)) return true;
	const file = app.vault.getFileByPath(path);
	if (!file) return false;
	const text = await app.vault.cachedRead(file);
	return text.toLowerCase().includes(needle);
}
