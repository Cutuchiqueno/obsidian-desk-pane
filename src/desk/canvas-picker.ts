import { normalizePath, prepareFuzzySearch, renderResults, SuggestModal } from 'obsidian';
import type { App, SearchResult, TFile } from 'obsidian';

/** A canvas the vault has, or the path a new one is to be created at. */
export type CanvasChoice = { file: TFile } | { newPath: string };

type CanvasSuggestion = { file: TFile; match: SearchResult | null } | { newPath: string };

const EXTENSION = '.canvas';

/**
 * Finds a canvas by name or creates one, the way the quick switcher finds or creates a note: type
 * to narrow the vault's canvases, and select the last item or press Shift+Enter to create one by
 * the name typed. A name with a slash in it is a path from the vault root; without one, the canvas
 * goes where Obsidian puts new canvases.
 */
export class CanvasPickerModal extends SuggestModal<CanvasSuggestion> {
	/** Most recently changed first, which is what the list shows before anything is typed. */
	private canvases: TFile[] = [];

	constructor(
		app: App,
		private readonly onChoose: (choice: CanvasChoice) => void,
	) {
		super(app);
		this.setPlaceholder('Find or create a canvas...');
		this.emptyStateText = 'Type a name to create a canvas.';
		this.setInstructions([
			{ command: '↑↓', purpose: 'to navigate' },
			{ command: '↵', purpose: 'to select' },
			{ command: 'shift ↵', purpose: 'to create' },
			{ command: 'esc', purpose: 'to dismiss' },
		]);
		this.scope.register(['Shift'], 'Enter', () => {
			const newPath = this.newPath(this.inputEl.value);
			if (newPath) {
				this.close();
				this.onChoose({ newPath });
			}
			return false;
		});
	}

	override async onOpen(): Promise<void> {
		this.canvases = this.app.vault
			.getFiles()
			.filter((file) => file.extension === EXTENSION.slice(1))
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
		await super.onOpen();
	}

	getSuggestions(query: string): CanvasSuggestion[] {
		const trimmed = query.trim();
		if (!trimmed) return this.canvases.map((file) => ({ file, match: null }));
		const search = prepareFuzzySearch(trimmed);
		const found = this.canvases
			.map((file) => ({ file, match: search(withoutExtension(file.path)) }))
			.filter((found): found is { file: TFile; match: SearchResult } => found.match !== null)
			.sort((a, b) => b.match.score - a.match.score);
		const newPath = this.newPath(query);
		return newPath ? [...found, { newPath }] : found;
	}

	renderSuggestion(suggestion: CanvasSuggestion, el: HTMLElement): void {
		if ('newPath' in suggestion) {
			// With where it goes below, as the quick switcher shows a note's folder.
			el.addClass('mod-complex');
			const contentEl = el.createDiv({ cls: 'suggestion-content' });
			contentEl.createDiv({ cls: 'suggestion-title', text: 'Create new canvas' });
			contentEl.createDiv({ cls: 'suggestion-note', text: suggestion.newPath });
			return;
		}
		const text = withoutExtension(suggestion.file.path);
		if (suggestion.match) renderResults(el, text, suggestion.match);
		else el.setText(text);
	}

	onChooseSuggestion(suggestion: CanvasSuggestion): void {
		this.onChoose('newPath' in suggestion ? suggestion : { file: suggestion.file });
	}

	/**
	 * Where a canvas named `query` would be created. Null without a name, or when something is
	 * already there: a canvas by that name is in the list to be selected instead. Names differing
	 * only in case count as taken, as they are on Windows and macOS.
	 */
	private newPath(query: string): string | null {
		const name = normalizePath(query.trim().replace(/\.canvas$/i, ''));
		if (!name || name === '/') return null;
		let path = `${name}${EXTENSION}`;
		if (!name.includes('/')) {
			const active = this.app.workspace.getActiveFile()?.path ?? '';
			const folder = this.app.fileManager.getNewFileParent(active, path);
			if (!folder.isRoot()) path = `${folder.path}/${path}`;
		}
		const lower = path.toLowerCase();
		const taken =
			this.app.vault.getAbstractFileByPath(path) !== null ||
			this.canvases.some((file) => file.path.toLowerCase() === lower);
		return taken ? null : path;
	}
}

function withoutExtension(path: string): string {
	return path.endsWith(EXTENSION) ? path.slice(0, -EXTENSION.length) : path;
}
