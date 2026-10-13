import { Notice, TextFileView } from 'obsidian';
import type { App, TFile, WorkspaceLeaf } from 'obsidian';
import type { AllCanvasNodeData, CanvasData, CanvasFileData } from 'obsidian/canvas';
import { CanvasPickerModal } from './canvas-picker';
import type { CanvasChoice } from './canvas-picker';
import { hasPart } from './note-part';
import { isNoteFile } from './types';
import type { DeskColor, DeskEntry } from './types';

/** The size Canvas gives a note dragged onto it. */
const CARD_WIDTH = 400;
const CARD_HEIGHT = 400;
/** Between the cards of the grid; a multiple of Canvas's 20px grid. */
const CARD_GAP = 40;
/** Between what a canvas already holds and the cards put beside it. */
const SIDE_GAP = 120;

/** Canvas's preset colors are numbered; it has none for blue and pink. */
const CANVAS_COLORS: Partial<Record<DeskColor, string>> = {
	red: '1',
	orange: '2',
	yellow: '3',
	green: '4',
	cyan: '5',
	purple: '6',
};

/**
 * Asks for a canvas, then puts the cards on it as file cards, in desk order, keeping their colors.
 * A new canvas gets them in a grid around its center; one with content already gets the grid to
 * the right of it, top-aligned. Cards whose note, heading, or block is gone are left out, and so
 * are cards the canvas already has.
 */
export function addToCanvas(app: App, entries: DeskEntry[]): void {
	const cards = entries.filter((entry) => {
		const file = app.vault.getFileByPath(entry.path);
		return isNoteFile(file) && (!entry.subpath || hasPart(app, file, entry.subpath));
	});
	if (cards.length === 0) {
		new Notice("There's nothing to add to a canvas.");
		return;
	}
	new CanvasPickerModal(app, (choice) => void placeOnCanvas(app, choice, cards)).open();
}

async function placeOnCanvas(app: App, choice: CanvasChoice, cards: DeskEntry[]): Promise<void> {
	try {
		let file: TFile;
		let added = cards.length;
		if ('file' in choice) {
			file = choice.file;
			added = await addToFile(app, file, cards);
		} else {
			file = await createCanvas(app, choice.newPath, cards);
		}
		new Notice(describeAdded(added, cards.length, file.basename));
		await openCanvas(app, file);
	} catch (error) {
		new Notice(
			`Couldn't add to the canvas. ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/** Returns how many cards were added, leaving out those already on the canvas. */
async function addToFile(app: App, file: TFile, cards: DeskEntry[]): Promise<number> {
	// An open canvas saves its edits a moment after they're made; those go to the file first, so
	// that the canvas reloads with them and the new cards, rather than writing over the new cards.
	for (const leaf of canvasLeaves(app, file)) {
		if (leaf.view instanceof TextFileView) await leaf.view.save();
	}
	let added = 0;
	await app.vault.process(file, (text) => {
		const data = parseCanvas(text);
		const fresh = cards.filter((card) => !data.nodes.some((node) => showsCard(node, card)));
		added = fresh.length;
		if (added === 0) return text;
		const ids = new Set([...data.nodes, ...data.edges].map((item) => item.id));
		data.nodes.push(...layOut(fresh, besideOrigin(data.nodes, fresh.length), ids));
		return serializeCanvas(data);
	});
	return added;
}

async function createCanvas(app: App, path: string, cards: DeskEntry[]): Promise<TFile> {
	const folder = path.slice(0, Math.max(path.lastIndexOf('/'), 0));
	if (folder && !app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);
	const nodes = layOut(cards, centeredOrigin(cards.length), new Set());
	return app.vault.create(path, serializeCanvas({ nodes, edges: [] }));
}

/** A canvas already open is brought to the front, rather than opened a second time. */
async function openCanvas(app: App, file: TFile): Promise<void> {
	const leaf = canvasLeaves(app, file)[0];
	if (leaf) await app.workspace.revealLeaf(leaf);
	else await app.workspace.getLeaf('tab').openFile(file);
}

/** By the view state, which a tab not yet loaded has too. */
function canvasLeaves(app: App, file: TFile): WorkspaceLeaf[] {
	return app.workspace
		.getLeavesOfType('canvas')
		.filter((leaf) => leaf.getViewState().state?.file === file.path);
}

function describeAdded(added: number, total: number, canvas: string): string {
	if (added === 0) {
		return total === 1
			? `This card is already on "${canvas}".`
			: `These cards are already on "${canvas}".`;
	}
	const message = `Added ${added === 1 ? '1 card' : `${added} cards`} to "${canvas}".`;
	const skipped = total - added;
	if (skipped === 0) return message;
	return `${message} ${skipped === 1 ? '1 was' : `${skipped} were`} already on it.`;
}

/** An empty file is an empty canvas, as Obsidian treats it. */
function parseCanvas(text: string): CanvasData {
	const unreadable = new Error("Its file can't be read as a canvas.");
	let data: unknown = {};
	try {
		if (text.trim()) data = JSON.parse(text);
	} catch {
		throw unreadable;
	}
	if (typeof data !== 'object' || data === null || Array.isArray(data)) throw unreadable;
	const record = data as Record<string, unknown>;
	return {
		...record,
		nodes: Array.isArray(record.nodes) ? (record.nodes as AllCanvasNodeData[]) : [],
		edges: Array.isArray(record.edges) ? (record.edges as CanvasData['edges']) : [],
	};
}

/**
 * The canvas as Obsidian writes it, tab-indented with a line for each card and each connection, so
 * that adding cards changes only the lines of the cards added.
 */
function serializeCanvas(data: CanvasData): string {
	const fields = Object.entries(data).map(([key, value]) => {
		const json =
			Array.isArray(value) && value.length > 0
				? `[\n\t\t${value.map((item) => JSON.stringify(item)).join(',\n\t\t')}\n\t]`
				: JSON.stringify(value);
		return `\t${JSON.stringify(key)}:${json}`;
	});
	return `{\n${fields.join(',\n')}\n}`;
}

function showsCard(node: AllCanvasNodeData, card: DeskEntry): boolean {
	return (
		node.type === 'file' &&
		node.file === card.path &&
		(node.subpath || undefined) === card.subpath
	);
}

interface Point {
	x: number;
	y: number;
}

/** Rows of cards, left to right, as close to a square as their number allows. */
function columnsFor(count: number): number {
	return Math.ceil(Math.sqrt(count));
}

function gridSize(count: number): Point {
	const columns = columnsFor(count);
	const rows = Math.ceil(count / columns);
	return {
		x: columns * (CARD_WIDTH + CARD_GAP) - CARD_GAP,
		y: rows * (CARD_HEIGHT + CARD_GAP) - CARD_GAP,
	};
}

/** The top left corner of a grid centered on the canvas's origin, where a new canvas opens. */
function centeredOrigin(count: number): Point {
	const size = gridSize(count);
	return { x: -size.x / 2, y: -size.y / 2 };
}

/** To the right of everything on the canvas, level with its top; centered when it's empty. */
function besideOrigin(nodes: AllCanvasNodeData[], count: number): Point {
	const placed = nodes.filter((node) =>
		[node.x, node.y, node.width, node.height].every((value) => Number.isFinite(value)),
	);
	if (placed.length === 0) return centeredOrigin(count);
	return {
		x: Math.max(...placed.map((node) => node.x + node.width)) + SIDE_GAP,
		y: Math.min(...placed.map((node) => node.y)),
	};
}

/** `ids` holds those the canvas uses already, and gets the new cards' too. */
function layOut(cards: DeskEntry[], origin: Point, ids: Set<string>): CanvasFileData[] {
	const columns = columnsFor(cards.length);
	return cards.map((card, index) => {
		const color = canvasColor(card.color);
		return {
			id: newId(ids),
			type: 'file',
			file: card.path,
			...(card.subpath ? { subpath: card.subpath } : {}),
			x: origin.x + (index % columns) * (CARD_WIDTH + CARD_GAP),
			y: origin.y + Math.floor(index / columns) * (CARD_HEIGHT + CARD_GAP),
			width: CARD_WIDTH,
			height: CARD_HEIGHT,
			...(color ? { color } : {}),
		};
	});
}

/**
 * A preset number where Canvas has one. Blue and pink become custom colors in the theme's blue and
 * pink, which stay as they are when the theme changes.
 */
function canvasColor(color: DeskColor | undefined): string | undefined {
	if (!color) return undefined;
	const preset = CANVAS_COLORS[color];
	if (preset) return preset;
	const rgb = getComputedStyle(activeDocument.body)
		.getPropertyValue(`--color-${color}-rgb`)
		.split(',')
		.map((channel) => Number(channel.trim()));
	const isByte = (channel: number) => Number.isInteger(channel) && channel >= 0 && channel <= 255;
	if (rgb.length !== 3 || !rgb.every(isByte)) return undefined;
	return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** Sixteen hex digits, like the IDs Canvas gives its cards. */
function newId(ids: Set<string>): string {
	let id = '';
	while (!id || ids.has(id)) {
		id = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
	}
	ids.add(id);
	return id;
}
