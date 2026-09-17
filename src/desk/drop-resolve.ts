import { normalizePath } from 'obsidian';
import type { App, TFile } from 'obsidian';
import { isNoteFile } from './types';

/**
 * Turns the payload of a drag that came from outside the Desk list into the Markdown notes it
 * refers to. Obsidian exposes no public API for its internal drag data, so this reads `text/plain`:
 * the File Explorer puts an `obsidian://open` URL there, while dragged link text arrives verbatim.
 * Editor tabs carry no payload at all; `TabDrag` handles those.
 */
export function resolveDroppedFiles(dataTransfer: DataTransfer | null, app: App): TFile[] {
	const text = dataTransfer?.getData('text/plain') || dataTransfer?.getData('text/uri-list') || '';
	const files: TFile[] = [];
	for (const line of text.split('\n')) {
		const file = resolveLinkText(extractLinkTarget(line, app), app);
		if (file && !files.includes(file)) files.push(file);
	}
	return files;
}

function extractLinkTarget(raw: string, app: App): string {
	let text = raw.trim();
	if (text.startsWith('!')) text = text.slice(1).trim();

	const wikilink = /^\[\[(.+)\]\]$/.exec(text);
	const markdownLink = /^\[[^\]]*\]\((.+)\)$/.exec(text);
	if (text.startsWith('obsidian://')) {
		text = vaultPathFromObsidianUrl(text, app) ?? '';
	} else if (wikilink?.[1]) {
		text = wikilink[1];
	} else if (markdownLink?.[1]) {
		text = markdownLink[1].trim();
		if (text.startsWith('<') && text.endsWith('>')) text = text.slice(1, -1);
		text = decodeUriComponentSafe(text);
	}

	const pipe = text.indexOf('|');
	if (pipe >= 0) text = text.slice(0, pipe);
	const hash = text.indexOf('#');
	if (hash > 0) text = text.slice(0, hash);
	return text.trim();
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

function resolveLinkText(linktext: string, app: App): TFile | null {
	if (!linktext) return null;
	const linked = app.metadataCache.getFirstLinkpathDest(linktext, '');
	if (linked) return asMarkdownFile(linked);
	const path = normalizePath(linktext);
	return asMarkdownFile(app.vault.getFileByPath(path) ?? app.vault.getFileByPath(`${path}.md`));
}

function asMarkdownFile(file: TFile | null): TFile | null {
	return isNoteFile(file) ? file : null;
}
