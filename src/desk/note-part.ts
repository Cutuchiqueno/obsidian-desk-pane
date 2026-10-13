import { resolveSubpath } from 'obsidian';
import type { App, BlockSubpathResult, HeadingSubpathResult, OpenViewState, TFile } from 'obsidian';
import type { DeskTarget } from './types';

/** Up to this many characters of a block's first line name its card. */
const BLOCK_TITLE_LENGTH = 30;

/** A block ID at the end of a line, as `^id` with letters, digits, and dashes. */
const BLOCK_ID_AT_END = /\s*\^[A-Za-z0-9-]+\s*$/;

/**
 * Where a heading's section or a block sits in its note, from the metadata cache. Null when the
 * note has no such heading or block, or the subpath names a footnote, which isn't put on a card.
 */
function locatePart(
	app: App,
	file: TFile,
	subpath: string,
): HeadingSubpathResult | BlockSubpathResult | null {
	const cache = app.metadataCache.getFileCache(file);
	const part = cache ? resolveSubpath(cache, subpath) : null;
	return part && part.type !== 'footnote' ? part : null;
}

export function hasPart(app: App, file: TFile, subpath: string): boolean {
	return locatePart(app, file, subpath) !== null;
}

/**
 * The card for a link into `file`. Obsidian opens a link to a heading or block the note doesn't
 * have at the top of the note, so such a link puts the whole note on the desk. A block's ID is
 * spelled the way the note spells it, so the same block never gets two cards.
 */
export function targetFor(app: App, file: TFile, subpath: string): DeskTarget {
	const part = subpath ? locatePart(app, file, subpath) : null;
	if (!part) return { path: file.path };
	return { path: file.path, subpath: part.type === 'block' ? `#^${part.block.id}` : subpath };
}

/**
 * The Markdown a card shows: its whole note, or only its heading's section, up to the next heading
 * of the same or a higher level, or only its block. Null when that heading or block is gone.
 */
export async function readTargetMarkdown(
	app: App,
	file: TFile,
	subpath: string | undefined,
): Promise<string | null> {
	const markdown = await app.vault.cachedRead(file);
	if (!subpath) return markdown;
	const part = locatePart(app, file, subpath);
	return part ? markdown.slice(part.start.offset, part.end?.offset) : null;
}

/**
 * What a card's title adds after its note's name: the heading, or the first words of the block.
 * A block that is gone, or has no words, is named by its ID.
 */
export async function partTitle(app: App, file: TFile | null, subpath: string): Promise<string> {
	if (!subpath.startsWith('#^')) return subpath.slice(1).split('#').join(' › ');
	const markdown = file ? await readTargetMarkdown(app, file, subpath) : null;
	const line = markdown?.split('\n').map(plainLine).find((text) => text.length > 0);
	if (!line) return subpath.slice(1);
	return line.length > BLOCK_TITLE_LENGTH ? `${line.slice(0, BLOCK_TITLE_LENGTH).trimEnd()}…` : line;
}

/** Opens a note scrolled to its heading or block, the way following a link to it does. */
export function openState(target: DeskTarget): OpenViewState {
	return target.subpath ? { eState: { subpath: target.subpath } } : {};
}

/** A line of a block without its Markdown markers, its block ID, or a code fence. */
function plainLine(line: string): string {
	return line
		.replace(BLOCK_ID_AT_END, '')
		.replace(/^\s*(?:>\s*)*/, '')
		.replace(/^\[![^\]]*\][+-]?/, '')
		.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?/, '')
		.replace(/^\s*(?:```|~~~|\$\$).*$/, '')
		.replace(/^\s*\|(.*?)\|?\s*$/, '$1')
		.trim();
}
