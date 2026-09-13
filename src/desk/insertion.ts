export interface InsertionPoint {
	/** Insertion index expressed against the list as it is right now. */
	index: number;
	/** Row to insert in front of, or null when the insertion point is the end of the list. */
	targetRowEl: HTMLElement | null;
}

/**
 * Boundaries are the midpoints of the row *headers*, not of whole rows, so an unfolded note's
 * preview doesn't push its own boundary far down the pane.
 */
export function computeInsertionIndex(listEl: HTMLElement, clientY: number): InsertionPoint {
	const rowEls = Array.from(listEl.querySelectorAll<HTMLElement>('.desk-item'));
	for (let index = 0; index < rowEls.length; index++) {
		const rowEl = rowEls[index];
		if (!rowEl) continue;
		const headerEl = rowEl.querySelector<HTMLElement>('.desk-item-header') ?? rowEl;
		const rect = headerEl.getBoundingClientRect();
		if (clientY < rect.top + rect.height / 2) {
			return { index, targetRowEl: rowEl };
		}
	}
	return { index: rowEls.length, targetRowEl: null };
}

export function showIndicator(
	listEl: HTMLElement,
	indicatorEl: HTMLElement,
	targetRowEl: HTMLElement | null,
): void {
	if (targetRowEl) {
		listEl.insertBefore(indicatorEl, targetRowEl);
	} else {
		listEl.appendChild(indicatorEl);
	}
}

export function hideIndicator(indicatorEl: HTMLElement): void {
	indicatorEl.remove();
}
