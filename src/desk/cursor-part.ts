import { Notice } from 'obsidian';
import type { App, CachedMetadata, Editor, ListItemCache, MarkdownView, TFile } from 'obsidian';
import { hasPart } from './note-part';
import type { DeskStore } from './store';
import { entryKey, isNoteFile } from './types';

/**
 * Blocks whose ID goes on a line of its own after them, with an empty line before and after it, as
 * Obsidian's help asks for structured blocks. On their last line, it would become part of them.
 */
const ID_ON_OWN_LINE = new Set(['blockquote', 'callout', 'code', 'math', 'table']);

/** A line that opens or closes a code or math block, which an ID at its end would break. */
const FENCE = /^\s*(?:```|~~~|\$\$)/;

/** How long to wait for Obsidian to index a note that was just saved. */
const REINDEX_TIMEOUT = 1000;

/** The heading or block the cursor is in: its subpath, or where an ID for it would go. */
interface CursorPart {
	kind: 'heading' | 'block';
	/** `#Heading` or `#^id`; null for a block that has no ID yet. */
	subpath: string | null;
	/** The line a new ID goes at the end of, or after, for a block without one. */
	idLine: number;
	idOnOwnLine: boolean;
}

/**
 * Whether the cursor is in a heading or block that isn't on the desk yet, and which. This reads the
 * note as Obsidian last indexed it, which is good enough to offer the command.
 */
export function cursorPartKind(
	app: App,
	store: DeskStore,
	view: MarkdownView,
): CursorPart['kind'] | null {
	const file = view.file;
	if (!isNoteFile(file)) return null;
	const part = findCursorPart(app, view.editor, file);
	if (!part) return null;
	if (part.subpath && store.has(entryKey({ path: file.path, subpath: part.subpath }))) return null;
	return part.kind;
}

/**
 * Puts the heading or block under the cursor on top of the desk. A block without an ID gets one
 * first, written into the note the way **Copy link to block** does. Returns whether it was added.
 */
export async function addCursorPart(app: App, store: DeskStore, view: MarkdownView): Promise<boolean> {
	const file = view.file;
	if (!isNoteFile(file)) return false;
	// Obsidian indexes a note as saved, while the cursor is in the note as the editor has it.
	await saveAndReindex(app, view, file);
	const part = view.file === file ? findCursorPart(app, view.editor, file) : null;
	if (!part) {
		new Notice("There's no heading or block to add here.");
		return false;
	}
	let subpath = part.subpath;
	if (!subpath) {
		subpath = writeBlockId(view.editor, part, app.metadataCache.getFileCache(file));
		// So the card finds its new block right away.
		await saveAndReindex(app, view, file);
	}
	store.addOnTop({ path: file.path, subpath });
	return true;
}

function findCursorPart(app: App, editor: Editor, file: TFile): CursorPart | null {
	const cache = app.metadataCache.getFileCache(file);
	const line = editor.getCursor().line;
	const section = cache?.sections?.find(
		({ position }) => position.start.line <= line && line <= position.end.line,
	);
	if (!cache || !section) return null;
	const { start, end } = section.position;

	if (section.type === 'heading') {
		const heading = cache.headings?.find((candidate) => candidate.position.start.line === start.line);
		if (!heading) return null;
		const subpath = `#${linkableHeading(heading.heading)}`;
		if (!hasPart(app, file, subpath)) return null;
		return { kind: 'heading', subpath, idLine: start.line, idOnOwnLine: false };
	}
	if (section.type === 'list') return findListItem(cache, editor, line);
	if (section.type !== 'paragraph' && !ID_ON_OWN_LINE.has(section.type)) return null;
	// Obsidian counts an ID on a line of its own after a block as that block's too.
	return {
		kind: 'block',
		subpath: section.id ? `#^${section.id}` : null,
		idLine: end.line,
		idOnOwnLine: section.type !== 'paragraph',
	};
}

/**
 * The innermost list item on `line`. Its ID goes at the end of its own text, before its child
 * items, so that the card shows the item and not its last child.
 */
function findListItem(cache: CachedMetadata, editor: Editor, line: number): CursorPart | null {
	const items = cache.listItems ?? [];
	let item: ListItemCache | undefined;
	for (const candidate of items) {
		const { start, end } = candidate.position;
		const isInner = !item || start.line > item.position.start.line;
		if (start.line <= line && line <= end.line && isInner) item = candidate;
	}
	if (!item) return null;
	const itemLine = item.position.start.line;
	const firstChild = items.find((candidate) => candidate.parent === itemLine);
	const idLine = firstChild ? firstChild.position.start.line - 1 : item.position.end.line;
	if (!item.id && FENCE.test(editor.getLine(idLine))) return null;
	return { kind: 'block', subpath: item.id ? `#^${item.id}` : null, idLine, idOnOwnLine: false };
}

function writeBlockId(editor: Editor, part: CursorPart, cache: CachedMetadata | null): string {
	const id = newBlockId(cache);
	const end = { line: part.idLine, ch: editor.getLine(part.idLine).length };
	if (part.idOnOwnLine) {
		const next = part.idLine + 1 < editor.lineCount() ? editor.getLine(part.idLine + 1) : '';
		editor.replaceRange(`\n\n^${id}${next.trim() ? '\n' : ''}`, end);
	} else {
		editor.replaceRange(` ^${id}`, end);
	}
	return `#^${id}`;
}

/** Six letters and digits, like the IDs Obsidian makes, and none the note has yet. */
function newBlockId(cache: CachedMetadata | null): string {
	const taken = new Set(Object.keys(cache?.blocks ?? {}));
	let id = '';
	while (id.length < 6 || taken.has(id)) id = Math.random().toString(36).slice(2, 8);
	return id;
}

/**
 * A heading as a link spells it. The characters that would end or split the link become spaces,
 * which Obsidian ignores when it looks the heading up.
 */
function linkableHeading(heading: string): string {
	return heading.replace(/[#^|[\]:]|%%/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Saves the editor's changes, if it has any, and waits for Obsidian to index the saved note. */
async function saveAndReindex(app: App, view: MarkdownView, file: TFile): Promise<void> {
	if (view.editor.getValue() === (await app.vault.cachedRead(file))) return;
	const reindexed = new Promise<void>((resolve) => {
		const ref = app.metadataCache.on('changed', (changed) => {
			if (changed === file) done();
		});
		const timer = window.setTimeout(done, REINDEX_TIMEOUT);
		function done() {
			app.metadataCache.offref(ref);
			window.clearTimeout(timer);
			resolve();
		}
	});
	await view.save();
	await reindexed;
}
