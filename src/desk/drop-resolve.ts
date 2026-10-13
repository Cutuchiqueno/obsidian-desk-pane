import { normalizePath, parseLinktext } from 'obsidian';
import type { App, TFile } from 'obsidian';
import { targetFor } from './note-part';
import { entryKey, isNoteFile } from './types';
import type { DeskTarget } from './types';

/**
 * Turns the payload of a drag that came from outside the Desk list into the cards it refers to:
 * Markdown notes, or their headings and blocks for a link like `[[Note#Heading]]`. Obsidian exposes
 * no public API for its internal drag data, so this reads `text/plain`: the File Explorer puts an
 * `obsidian://open` URL there, while dragged link text arrives verbatim. Editor tabs carry no
 * payload at all; `TabDrag` handles those.
 */
export function resolveDroppedTargets(dataTransfer: DataTransfer | null, app: App): DeskTarget[] {
	const text = dataTransfer?.getData('text/plain') || dataTransfer?.getData('text/uri-list') || '';
	const targets = new Map<string, DeskTarget>();
	for (const line of text.split('\n')) {
		const { path, subpath } = extractLinkTarget(line, app);
		const file = resolveLinkPath(path, app);
		if (!file) continue;
		const target = targetFor(app, file, subpath);
		targets.set(entryKey(target), target);
	}
	return Array.from(targets.values());
}

/** The note a dragged line links to, and the `#Heading` or `#^block` in it, if any. */
function extractLinkTarget(raw: string, app: App): { path: string; subpath: string } {
	let text = raw.trim();
	if (text.startsWith('!')) text = text.slice(1).trim();
	// The URL names a whole note, by a path that may itself contain a `#`.
	if (text.startsWith('obsidian://')) {
		return { path: vaultPathFromObsidianUrl(text, app) ?? '', subpath: '' };
	}

	const wikilink = /^\[\[(.+)\]\]$/.exec(text);
	const markdownLink = /^\[[^\]]*\]\((.+)\)$/.exec(text);
	if (wikilink?.[1]) {
		text = wikilink[1];
	} else if (markdownLink?.[1]) {
		text = markdownLink[1].trim();
		if (text.startsWith('<') && text.endsWith('>')) text = text.slice(1, -1);
		text = decodeUriComponentSafe(text);
	}

	const pipe = text.indexOf('|');
	if (pipe >= 0) text = text.slice(0, pipe);
	const { path, subpath } = parseLinktext(text.trim());
	return { path: path.trim(), subpath };
}

/** File Explorer drags carry `obsidian://open?vault=…&file=<vault path without extension>`. */
function vaultPathFromObsidianUrl(text: string, app: App): string | null {
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		return null;
	}
	const vault = url.searchParams.get('vault');
	if (vault && vault !== app.vault.getName()) return null;
	return url.searchParams.get('file');
}

function decodeUriComponentSafe(text: string): string {
	try {
		return decodeURIComponent(text);
	} catch {
		return text;
	}
}

/** Empty for a link into the note it's in, like `[[#Heading]]`, which can't say which note that is. */
function resolveLinkPath(linkpath: string, app: App): TFile | null {
	if (!linkpath) return null;
	const linked = app.metadataCache.getFirstLinkpathDest(linkpath, '');
	if (linked) return asMarkdownFile(linked);
	const path = normalizePath(linkpath);
	return asMarkdownFile(app.vault.getFileByPath(path) ?? app.vault.getFileByPath(`${path}.md`));
}

function asMarkdownFile(file: TFile | null): TFile | null {
	return isNoteFile(file) ? file : null;
}
