import { Component } from 'obsidian';
import { setPreviewHeight } from './row';
import type { DeskStore } from './store';

/** How far a press on the edge must move before it resizes, so a plain click saves no height. */
const DRAG_THRESHOLD = 3;

/** Lines a preview keeps when dragged shorter, so a card never shrinks to just its title. */
const MIN_PREVIEW_LINES = 2;

interface EdgeDrag {
	cardEl: HTMLElement;
	previewEl: HTMLElement;
	pointerId: number;
	startY: number;
	startHeight: number;
	minHeight: number;
	maxHeight: number;
	/** Unset until the pointer has moved past the threshold. */
	height?: number;
}

/**
 * Resizes a card by dragging its bottom edge, which sets how tall its preview may be: from a few
 * lines up to the whole note, within the height cap the stylesheet sets.
 */
export class DeskResizeController extends Component {
	private drag: EdgeDrag | null = null;
	/** The card whose edge the pointer is over, marked so the stylesheet can light its edge up. */
	private hoverEl: HTMLElement | null = null;

	constructor(
		private readonly listEl: HTMLElement,
		private readonly store: DeskStore,
	) {
		super();
	}

	override onload(): void {
		// The handle captures the pointer, so the rest of a drag arrives here even outside the pane.
		this.registerDomEvent(this.listEl, 'pointerdown', (evt) => this.onPointerDown(evt));
		this.registerDomEvent(this.listEl, 'pointermove', (evt) => this.onPointerMove(evt));
		this.registerDomEvent(this.listEl, 'pointerup', (evt) => this.onPointerEnd(evt));
		this.registerDomEvent(this.listEl, 'pointercancel', (evt) => this.onPointerEnd(evt));
		// `pointerover` fires for every element the pointer enters, so moving off the handle onto the
		// card clears the mark; leaving the list altogether sends no `pointerover`, hence the second.
		this.registerDomEvent(this.listEl, 'pointerover', (evt) => this.setHover(evt.target));
		this.registerDomEvent(this.listEl, 'pointerleave', () => this.setHover(null));
	}

	override onunload(): void {
		this.setHover(null);
	}

	/** Marks the card whose resize handle is under `target`, if any, and unmarks the last one. */
	private setHover(target: EventTarget | null): void {
		const handleEl =
			target instanceof Element ? target.closest('.desk-item-resize-handle') : null;
		const cardEl = handleEl?.closest<HTMLElement>('.desk-item') ?? null;
		if (cardEl === this.hoverEl) return;
		this.hoverEl?.removeClass('is-resize-hover');
		this.hoverEl = cardEl;
		cardEl?.addClass('is-resize-hover');
	}

	private onPointerDown(evt: PointerEvent): void {
		if (!evt.isPrimary || evt.button !== 0 || !(evt.target instanceof Element)) return;
		const handleEl = evt.target.closest<HTMLElement>('.desk-item-resize-handle');
		const cardEl = handleEl?.closest<HTMLElement>('.desk-item');
		const previewEl = cardEl?.querySelector<HTMLElement>(':scope > .desk-item-preview');
		if (!handleEl || !cardEl || !previewEl) return;
		evt.preventDefault();
		handleEl.setPointerCapture(evt.pointerId);

		const style = getComputedStyle(previewEl);
		const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
		const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
		// The preview's border, plus a horizontal scrollbar if it shows one.
		const edges = previewEl.offsetHeight - previewEl.clientHeight;
		// The header and the card's borders, which share the cap with the preview.
		const chrome = cardEl.offsetHeight - previewEl.offsetHeight;
		const cap = (parseFloat(getComputedStyle(cardEl).maxHeight) || Infinity) - chrome;

		// The height on screen, which the cap or a shorter note may hold below the saved one.
		const startHeight = previewEl.offsetHeight;
		this.drag = {
			cardEl,
			previewEl,
			pointerId: evt.pointerId,
			startY: evt.clientY,
			startHeight,
			// A preview already shorter than the minimum doesn't jump to it.
			minHeight: Math.min(edges + padding + MIN_PREVIEW_LINES * lineHeight, startHeight),
			maxHeight: Math.min(edges + previewEl.scrollHeight, cap),
		};
	}

	private onPointerMove(evt: PointerEvent): void {
		const drag = this.drag;
		if (!drag || evt.pointerId !== drag.pointerId) return;
		const delta = evt.clientY - drag.startY;
		if (drag.height === undefined) {
			if (Math.abs(delta) < DRAG_THRESHOLD) return;
			drag.cardEl.addClass('is-resizing');
		}
		drag.height = Math.min(Math.max(drag.startHeight + delta, drag.minHeight), drag.maxHeight);
		setPreviewHeight(drag.previewEl, Math.round(drag.height));
	}

	private onPointerEnd(evt: PointerEvent): void {
		const drag = this.drag;
		if (!drag || evt.pointerId !== drag.pointerId) return;
		this.drag = null;
		if (drag.height === undefined) return;
		drag.cardEl.removeClass('is-resizing');
		// Dragged all the way open, the card fits its note again, and keeps doing so as the note grows.
		const rounded = Math.round(drag.height);
		const height = rounded < Math.round(drag.maxHeight) ? rounded : undefined;
		setPreviewHeight(drag.previewEl, height);
		const path = drag.cardEl.dataset.path;
		if (path) this.store.setPreviewHeight(path, height);
	}
}
