/**
 * The desk as a state-based CRDT: every synced value is a last-writer-wins register stamped by a
 * hybrid logical clock, removed cards leave a tombstone, and the order is one register holding
 * the list of cards. `merge` is commutative, associative and idempotent, so devices end up with
 * the same desk whatever order, however often, and however stale their states arrive in.
 *
 * Replicas are treated as immutable: every function returns a new one. Recording changes lives in
 * `changes.ts`, storing in `format.ts`.
 */

import { colorRank, entryKey, GROUP_NAME_KEYS } from '../model';
import type { DeskColor, DeskEntry, GroupNames } from '../model';
import { compareStamps, generationOf, maxStamp } from './hlc';
import type { Stamp } from './hlc';

export type Register<T> = readonly [T, Stamp];

export interface CardState {
	path: string;
	subpath?: string;
	/** When the card was (last) put on the desk. It is gone while `gone[key]` is later. */
	present: Stamp;
	collapsed?: Register<boolean>;
	color?: Register<DeskColor | null>;
}

export interface DeviceState {
	name?: Register<string>;
	/** The device's latest write, for the device list and the returner rule. */
	seen?: Stamp;
}

/** The settings that follow the desk across devices. */
export interface Prefs {
	defaultFolded: boolean;
	cardMaxHeight: number;
	inboxFolder: string;
}

export type PrefKey = keyof Prefs;
export const PREF_KEYS: readonly PrefKey[] = ['defaultFolded', 'cardMaxHeight', 'inboxFolder'];

export interface Replica {
	cards: Record<string, CardState>;
	/** Tombstones: a card's key and when it was taken off the desk. */
	gone: Record<string, Stamp>;
	order?: Register<string[]>;
	grouped?: Register<boolean>;
	names: Partial<Record<DeskColor | 'none', Register<string | null>>>;
	prefs: { [K in PrefKey]?: Register<Prefs[K]> };
	devices: Record<string, DeviceState>;
}

/** What the store shows: the desk without the device-local card heights. */
export interface DeskState {
	entries: DeskEntry[];
	grouped: boolean;
	names: GroupNames;
	prefs: Prefs;
}

export function emptyReplica(): Replica {
	return { cards: {}, gone: {}, names: {}, prefs: {}, devices: {} };
}

// --- merging -----------------------------------------------------------------------------------

/** Deterministic JSON, keys sorted, for comparing values and states. */
export function stableJson(value: unknown): string {
	return JSON.stringify(sortKeys(value)) ?? 'null';
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value !== null && typeof value === 'object') {
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(value).sort()) {
			const inner = (value as Record<string, unknown>)[key];
			if (inner !== undefined) sorted[key] = sortKeys(inner);
		}
		return sorted;
	}
	return value;
}

/** The later register; on equal stamps, which only a duplicated device ID makes, the larger value. */
export function pickRegister<T>(a: Register<T> | undefined, b: Register<T> | undefined): Register<T> | undefined {
	if (a === undefined) return b;
	if (b === undefined) return a;
	const byStamp = compareStamps(a[1], b[1]);
	if (byStamp !== 0) return byStamp > 0 ? a : b;
	return stableJson(a[0]) >= stableJson(b[0]) ? a : b;
}

/**
 * A card put on the desk again, by hand or by renaming a note onto its key, is a new incarnation.
 * Its fields start from what that incarnation brought; fields of an older incarnation only count
 * when they were set later than the newer one began. Incarnations are told apart by the wall time
 * and counter of `present`, not the device, so every device replaying the same rename makes the
 * same incarnation.
 */
function mergeCard(a: CardState, b: CardState): CardState {
	const byPresent = compareStamps(a.present, b.present);
	const top =
		byPresent > 0 || (byPresent === 0 && stableJson([a.path, a.subpath]) >= stableJson([b.path, b.subpath]))
			? a
			: b;
	const present = top.present;
	const counts = <T,>(card: CardState, register: Register<T> | undefined): Register<T> | undefined =>
		register &&
		(generationOf(card.present) === generationOf(present) || generationOf(register[1]) > generationOf(present))
			? register
			: undefined;
	return compactCard({
		path: top.path,
		subpath: top.subpath,
		present,
		collapsed: pickRegister(counts(a, a.collapsed), counts(b, b.collapsed)),
		color: pickRegister(counts(a, a.color), counts(b, b.color)),
	});
}

export function compactCard(card: CardState): CardState {
	const out: CardState = { path: card.path, present: card.present };
	if (card.subpath) out.subpath = card.subpath;
	if (card.collapsed) out.collapsed = card.collapsed;
	if (card.color) out.color = card.color;
	return out;
}

function union(a: object, b: object): string[] {
	return Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
}

export function merge(a: Replica, b: Replica): Replica {
	const out = emptyReplica();
	for (const key of union(a.cards, b.cards)) {
		const x = a.cards[key];
		const y = b.cards[key];
		const card = x && y ? mergeCard(x, y) : (x ?? y);
		if (card) out.cards[key] = compactCard(card);
	}
	for (const key of union(a.gone, b.gone)) {
		const stamp = maxStamp(a.gone[key], b.gone[key]);
		if (stamp) out.gone[key] = stamp;
	}
	const order = pickRegister(a.order, b.order);
	if (order) out.order = order;
	const grouped = pickRegister(a.grouped, b.grouped);
	if (grouped) out.grouped = grouped;
	for (const key of GROUP_NAME_KEYS) {
		const name = pickRegister(a.names[key], b.names[key]);
		if (name) out.names[key] = name;
	}
	const prefs = out.prefs as Record<PrefKey, Register<unknown> | undefined>;
	const aPrefs = a.prefs as Record<PrefKey, Register<unknown> | undefined>;
	const bPrefs = b.prefs as Record<PrefKey, Register<unknown> | undefined>;
	for (const key of PREF_KEYS) {
		const pref = pickRegister(aPrefs[key], bPrefs[key]);
		if (pref) prefs[key] = pref;
	}
	for (const id of union(a.devices, b.devices)) {
		const x = a.devices[id];
		const y = b.devices[id];
		const device: DeviceState = {};
		const name = pickRegister(x?.name, y?.name);
		if (name) device.name = name;
		const seen = maxStamp(x?.seen, y?.seen);
		if (seen) device.seen = seen;
		out.devices[id] = device;
	}
	return normalize(out);
}

/**
 * Drops tombstones a later add outlived. A removed card keeps its fields next to its tombstone until
 * both are collected: a device that never saw the removal may still bring edits, and dropping them
 * on some devices but not others would make merging depend on its order.
 */
export function normalize(replica: Replica): Replica {
	for (const [key, card] of Object.entries(replica.cards)) {
		const gone = replica.gone[key];
		if (gone !== undefined && compareStamps(card.present, gone) > 0) delete replica.gone[key];
	}
	return replica;
}

export function mergeAll(replicas: readonly Replica[]): Replica {
	return replicas.reduce(merge, emptyReplica());
}

/** Whether the card is on the desk: put there later than it was last taken off. */
export function isLive(replica: Replica, key: string): boolean {
	const card = replica.cards[key];
	if (!card) return false;
	const gone = replica.gone[key];
	return gone === undefined || compareStamps(card.present, gone) > 0;
}

/** The cards on the desk, by key. */
export function liveCards(replica: Replica): [string, CardState][] {
	return Object.entries(replica.cards).filter(([key]) => isLive(replica, key));
}

/** The replica without the device list, which every write touches. */
function withoutDevices(replica: Replica): Replica {
	return { ...replica, devices: {} };
}

/** Whether `outer` already holds everything `inner` knows, apart from the device list. */
export function contains(outer: Replica, inner: Replica): boolean {
	const plain = withoutDevices(outer);
	return stableJson(merge(plain, withoutDevices(inner))) === stableJson(merge(plain, emptyReplica()));
}

/** The latest stamp anywhere in the replica, which the clock moves past after reading it. */
export function latestStamp(replica: Replica, device?: string): Stamp | undefined {
	let latest: Stamp | undefined;
	const see = (stamp: Stamp | undefined) => {
		if (stamp === undefined || (device !== undefined && !stamp.endsWith(`-${device}`))) return;
		latest = maxStamp(latest, stamp);
	};
	for (const card of Object.values(replica.cards)) {
		see(card.present);
		see(card.collapsed?.[1]);
		see(card.color?.[1]);
	}
	Object.values(replica.gone).forEach(see);
	see(replica.order?.[1]);
	see(replica.grouped?.[1]);
	Object.values(replica.names).forEach((name) => see(name?.[1]));
	Object.values(replica.prefs).forEach((pref) => see(pref?.[1]));
	for (const state of Object.values(replica.devices)) {
		see(state.name?.[1]);
		see(state.seen);
	}
	return latest;
}

// --- materializing -----------------------------------------------------------------------------

function toEntry(card: CardState): DeskEntry {
	const entry: DeskEntry = { path: card.path, collapsed: card.collapsed?.[0] ?? false };
	if (card.subpath) entry.subpath = card.subpath;
	const color = card.color?.[0];
	if (color) entry.color = color;
	return entry;
}

function byKey(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The desk a replica describes. Cards follow the order register; cards it doesn't list — added on
 * another device while this one reordered — go on top, newest first, where new cards go anyway.
 * While grouped, a stable sort by color keeps that order within each color's block.
 */
export function materialize(replica: Replica, defaults: Prefs): DeskState {
	const listed: string[] = [];
	const seen = new Set<string>();
	for (const key of replica.order?.[0] ?? []) {
		if (!isLive(replica, key) || seen.has(key)) continue;
		listed.push(key);
		seen.add(key);
	}
	const unlisted = liveCards(replica)
		.map(([key]) => key)
		.filter((key) => !seen.has(key))
		.sort((a, b) => compareStamps(replica.cards[b]!.present, replica.cards[a]!.present) || byKey(a, b));
	const grouped = replica.grouped?.[0] ?? false;
	const entries = [...unlisted, ...listed].map((key) => toEntry(replica.cards[key]!));
	if (grouped) entries.sort((a, b) => colorRank(a) - colorRank(b));

	const names: GroupNames = {};
	for (const key of GROUP_NAME_KEYS) {
		const name = replica.names[key]?.[0];
		if (name) names[key] = name;
	}
	const prefs: Prefs = {
		defaultFolded: replica.prefs.defaultFolded?.[0] ?? defaults.defaultFolded,
		cardMaxHeight: replica.prefs.cardMaxHeight?.[0] ?? defaults.cardMaxHeight,
		inboxFolder: replica.prefs.inboxFolder?.[0] ?? defaults.inboxFolder,
	};
	return { entries, grouped, names, prefs };
}

/** Whether two desks look the same: cards, their order, folding and colors, groups and settings. */
export function sameDeskState(a: DeskState, b: DeskState): boolean {
	if (a.grouped !== b.grouped || a.entries.length !== b.entries.length) return false;
	const sameEntries = a.entries.every((entry, index) => {
		const other = b.entries[index];
		return (
			other !== undefined &&
			entryKey(entry) === entryKey(other) &&
			entry.collapsed === other.collapsed &&
			(entry.color ?? null) === (other.color ?? null)
		);
	});
	if (!sameEntries) return false;
	if (GROUP_NAME_KEYS.some((key) => (a.names[key] ?? null) !== (b.names[key] ?? null))) return false;
	return PREF_KEYS.every((key) => a.prefs[key] === b.prefs[key]);
}
