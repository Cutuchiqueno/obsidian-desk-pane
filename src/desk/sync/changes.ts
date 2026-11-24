/** Turning what changed on the desk into patches to the replica, and cleaning the replica up. */

import { entryKey, GROUP_NAME_KEYS } from '../model';
import type { DeskEntry } from '../model';
import { bump, compareStamps, maxStamp, minimalStamp, wallOf } from './hlc';
import type { Stamp } from './hlc';
import { compactCard, emptyReplica, isLive, liveCards, materialize, merge, PREF_KEYS } from './replica';
import type { CardState, DeskState, PrefKey, Prefs, Register, Replica } from './replica';

function sameList(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((item, index) => item === b[index]);
}

function dedupe(entries: readonly DeskEntry[]): DeskEntry[] {
	const seen = new Set<string>();
	return entries.filter((entry) => {
		const key = entryKey(entry);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * What the user changed, as a patch: a small replica with a register for every value that differs
 * between the desk `basis` describes — the one the store showed — and `next`, all stamped `stamp`.
 * Merged into the current replica, the patch carries the user's change and nothing else, so changes
 * from other devices the store hasn't shown yet aren't undone.
 *
 * `reassert` holds the cards put on the desk deliberately, which come back if another device took
 * them off meanwhile. The order register is written only when the desk would otherwise come out in
 * another order: adding on top, removing, folding or coloring leave a concurrent reorder elsewhere
 * standing.
 */
export function recordLocal(
	basis: Replica,
	next: DeskState,
	stamp: Stamp,
	defaults: Prefs,
	reassert: ReadonlySet<string> = new Set(),
): Replica | null {
	const prev = materialize(basis, defaults);
	const patch = emptyReplica();
	let changed = false;

	const prevByKey = new Map(prev.entries.map((entry) => [entryKey(entry), entry]));
	const entries = dedupe(next.entries);
	const nextKeys = entries.map(entryKey);
	for (const entry of entries) {
		const key = entryKey(entry);
		const before = prevByKey.get(key);
		const card = isLive(basis, key) ? basis.cards[key] : undefined;
		const color = entry.color ?? null;
		if (!before || !card || reassert.has(key)) {
			patch.cards[key] = compactCard({
				path: entry.path,
				subpath: entry.subpath,
				present: stamp,
				collapsed: [entry.collapsed, stamp],
				color: [color, stamp],
			});
			changed = true;
			continue;
		}
		const update: CardState = { path: card.path, subpath: card.subpath, present: card.present };
		if (before.collapsed !== entry.collapsed) update.collapsed = [entry.collapsed, stamp];
		if ((before.color ?? null) !== color) update.color = [color, stamp];
		if (update.collapsed || update.color) {
			patch.cards[key] = compactCard(update);
			changed = true;
		}
	}
	const nextKeySet = new Set(nextKeys);
	for (const key of prevByKey.keys()) {
		if (nextKeySet.has(key)) continue;
		patch.gone[key] = stamp;
		changed = true;
	}

	if (prev.grouped !== next.grouped) {
		patch.grouped = [next.grouped, stamp];
		changed = true;
	}
	for (const key of GROUP_NAME_KEYS) {
		const name = next.names[key] ?? null;
		if ((prev.names[key] ?? null) === name) continue;
		patch.names[key] = [name, stamp];
		changed = true;
	}
	const prefs = patch.prefs as Record<PrefKey, Register<unknown> | undefined>;
	for (const key of PREF_KEYS) {
		if (prev.prefs[key] === next.prefs[key]) continue;
		prefs[key] = [next.prefs[key], stamp];
		changed = true;
	}

	const keysAfter = materialize(merge(basis, patch), defaults).entries.map(entryKey);
	if (!sameList(keysAfter, nextKeys)) {
		patch.order = [nextKeys, stamp];
		changed = true;
	}
	return changed ? patch : null;
}

/**
 * A note renamed on any device, as this one saw it. The cards move to the new key with their own
 * stamps, so replaying the rename on another device overrides nothing done after it. A card whose
 * new key is already on the desk is left alone: another device got there first, or the old name was
 * taken again by a new note.
 */
export function recordRename(replica: Replica, oldPath: string, newPath: string, device: string): Replica | null {
	const patch = emptyReplica();
	const renamed = new Map<string, string>();
	for (const [key, card] of liveCards(replica)) {
		if (card.path !== oldPath) continue;
		const newKey = entryKey({ path: newPath, subpath: card.subpath });
		if (isLive(replica, newKey)) continue;
		const present = bump(maxStamp(card.present, replica.gone[newKey]) ?? card.present, device);
		patch.cards[newKey] = compactCard({ ...card, path: newPath, present });
		patch.gone[key] = bump(card.present, device);
		renamed.set(key, newKey);
	}
	if (renamed.size === 0) return null;
	const order = replica.order;
	if (order && order[0].some((key) => renamed.has(key))) {
		patch.order = [order[0].map((key) => renamed.get(key) ?? key), bump(order[1], device)];
	}
	return patch;
}

/** A note deleted on any device, as this one saw it: its cards go, and nothing added after. */
export function recordDelete(replica: Replica, path: string, device: string): Replica | null {
	const patch = emptyReplica();
	for (const [key, card] of liveCards(replica)) {
		if (card.path === path) patch.gone[key] = bump(card.present, device);
	}
	return Object.keys(patch.gone).length > 0 ? patch : null;
}

/** The desk as it was before syncing, with stamps that anything a device actually did outranks. */
export function fromDeskState(state: DeskState, device: string): Replica {
	const stamp = minimalStamp(device);
	const replica = emptyReplica();
	const entries = dedupe(state.entries);
	for (const entry of entries) {
		replica.cards[entryKey(entry)] = compactCard({
			path: entry.path,
			subpath: entry.subpath,
			present: stamp,
			collapsed: [entry.collapsed, stamp],
			color: [entry.color ?? null, stamp],
		});
	}
	replica.order = [entries.map(entryKey), stamp];
	replica.grouped = [state.grouped, stamp];
	for (const key of GROUP_NAME_KEYS) {
		const name = state.names[key];
		if (name) replica.names[key] = [name, stamp];
	}
	replica.prefs = {
		defaultFolded: [state.prefs.defaultFolded, stamp],
		cardMaxHeight: [state.prefs.cardMaxHeight, stamp],
		inboxFolder: [state.prefs.inboxFolder, stamp],
	};
	return replica;
}

// --- cleaning up -------------------------------------------------------------------------------

export const TOMBSTONE_HORIZON_MS = 90 * 24 * 60 * 60 * 1000;
export const DEVICE_HORIZON_MS = 365 * 24 * 60 * 60 * 1000;

/** Drops tombstones older than the horizon, and devices not seen for a year. */
export function collectGarbage(
	replica: Replica,
	now: number,
	tombstoneHorizon = TOMBSTONE_HORIZON_MS,
	deviceHorizon = DEVICE_HORIZON_MS,
): Replica {
	const out: Replica = { ...replica, cards: { ...replica.cards }, gone: {}, devices: {} };
	for (const [key, stamp] of Object.entries(replica.gone)) {
		if (now - wallOf(stamp) <= tombstoneHorizon) {
			out.gone[key] = stamp;
			continue;
		}
		// The removed card's leftover fields go with its tombstone; without it they'd count as live.
		const card = out.cards[key];
		if (card && compareStamps(card.present, stamp) <= 0) delete out.cards[key];
	}
	for (const [id, state] of Object.entries(replica.devices)) {
		if (state.seen === undefined || now - wallOf(state.seen) <= deviceHorizon) out.devices[id] = state;
	}
	return out;
}

/**
 * A device back after longer than the tombstone horizon may hold cards others removed and long
 * forgot. Before it writes, it drops its cards no other replica knows of, unless it changed them
 * after it last heard from another device: those are its own offline work.
 */
export function applyReturnerRule(
	own: Replica,
	others: Replica,
	device: string,
	now: number,
	horizon = TOMBSTONE_HORIZON_MS,
): Replica {
	let lastContact: number | undefined;
	for (const [id, state] of Object.entries(own.devices)) {
		if (id === device || state.seen === undefined) continue;
		lastContact = Math.max(lastContact ?? 0, wallOf(state.seen));
	}
	const othersKnowAnything = Object.keys(others.cards).length > 0 || Object.keys(others.gone).length > 0;
	if (lastContact === undefined || now - lastContact <= horizon || !othersKnowAnything) return own;

	const cards: Record<string, CardState> = {};
	for (const [key, card] of Object.entries(own.cards)) {
		if (!isLive(own, key)) {
			cards[key] = card;
			continue;
		}
		const known = others.cards[key] !== undefined || others.gone[key] !== undefined;
		const newest = maxStamp(maxStamp(card.present, card.collapsed?.[1]), card.color?.[1]) ?? card.present;
		if (known || wallOf(newest) >= lastContact) cards[key] = card;
	}
	return { ...own, cards };
}
