/** How replicas are named and stored in `data.json`, and read back without trusting the file. */

import { entryKey, GROUP_NAME_KEYS, isDeskColor } from '../model';
import type { DeskColor } from '../model';
import { generationOf, isDeviceId, isStamp } from './hlc';
import type { Stamp } from './hlc';
import { compactCard, emptyReplica, normalize } from './replica';
import type { CardState, DeviceState, Register, Replica } from './replica';

export const REPLICA_FORMAT = 1;
export const REPLICA_KEY_PREFIX = 'replica:';

export function replicaKey(device: string, stamp: Stamp): string {
	return `${REPLICA_KEY_PREFIX}${device}@${generationOf(stamp)}`;
}

/** The device a `replica:<device>@<generation>` key belongs to. */
export function deviceOfKey(key: string): string | null {
	if (!key.startsWith(REPLICA_KEY_PREFIX)) return null;
	const device = key.slice(REPLICA_KEY_PREFIX.length).split('@')[0];
	return isDeviceId(device) ? device : null;
}

export function isReplicaKey(key: string): boolean {
	return key.startsWith(REPLICA_KEY_PREFIX);
}

export function serializeReplica(replica: Replica): Record<string, unknown> {
	return {
		format: REPLICA_FORMAT,
		cards: replica.cards,
		gone: replica.gone,
		order: replica.order,
		groups: { grouped: replica.grouped, names: replica.names },
		prefs: replica.prefs,
		devices: replica.devices,
	};
}

export interface ReadResult {
	/** Every readable replica, keyed as in `data.json`. */
	replicas: Map<string, Replica>;
	/** Whether a replica was written by a newer version of the plugin and skipped. */
	newerFormat: boolean;
	/** Whether something was unreadable and skipped. */
	damaged: boolean;
}

/** Reads every replica in a `data.json` object, skipping what it can't read rather than failing. */
export function readReplicas(data: unknown): ReadResult {
	const result: ReadResult = { replicas: new Map(), newerFormat: false, damaged: false };
	if (!isRecord(data)) return result;
	for (const [key, value] of Object.entries(data)) {
		if (!isReplicaKey(key)) continue;
		const parsed = parseReplica(value);
		if (parsed === 'newer') result.newerFormat = true;
		else if (parsed === null) result.damaged = true;
		else {
			if (parsed.damaged) result.damaged = true;
			result.replicas.set(key, parsed.replica);
		}
	}
	return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Keys that would reach an object's prototype if assigned. */
function isSafeKey(key: string): boolean {
	return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

function readRegister<T>(value: unknown, isValue: (inner: unknown) => inner is T): Register<T> | undefined {
	if (!Array.isArray(value) || value.length !== 2 || !isStamp(value[1]) || !isValue(value[0])) return undefined;
	return [value[0], value[1]];
}

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isString = (value: unknown): value is string => typeof value === 'string';
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isColorOrNull = (value: unknown): value is DeskColor | null => value === null || isDeskColor(value);
const isStringOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string';
const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);

/** Parses one replica; damaged parts are left out and reported, a newer format is not read at all. */
export function parseReplica(value: unknown): { replica: Replica; damaged: boolean } | 'newer' | null {
	if (!isRecord(value) || typeof value.format !== 'number') return null;
	if (value.format > REPLICA_FORMAT) return 'newer';
	const replica = emptyReplica();
	let damaged = false;
	const skip = () => (damaged = true);

	if (isRecord(value.cards)) {
		for (const [key, raw] of Object.entries(value.cards)) {
			if (!isSafeKey(key) || !isRecord(raw) || !isString(raw.path) || !isStamp(raw.present)) {
				skip();
				continue;
			}
			const subpath = isString(raw.subpath) && raw.subpath ? raw.subpath : undefined;
			if (entryKey({ path: raw.path, subpath }) !== key) {
				skip();
				continue;
			}
			const card: CardState = { path: raw.path, subpath, present: raw.present };
			const collapsed = readRegister(raw.collapsed, isBoolean);
			if (collapsed) card.collapsed = collapsed;
			else if (raw.collapsed !== undefined) skip();
			const color = readRegister(raw.color, isColorOrNull);
			if (color) card.color = color;
			else if (raw.color !== undefined) skip();
			replica.cards[key] = compactCard(card);
		}
	} else if (value.cards !== undefined) skip();

	if (isRecord(value.gone)) {
		for (const [key, stamp] of Object.entries(value.gone)) {
			if (isSafeKey(key) && isStamp(stamp)) replica.gone[key] = stamp;
			else skip();
		}
	} else if (value.gone !== undefined) skip();

	const order = readRegister(value.order, isStringList);
	if (order) replica.order = order;
	else if (value.order !== undefined) skip();

	const groups = isRecord(value.groups) ? value.groups : {};
	const grouped = readRegister(groups.grouped, isBoolean);
	if (grouped) replica.grouped = grouped;
	else if (groups.grouped !== undefined) skip();
	if (isRecord(groups.names)) {
		for (const key of GROUP_NAME_KEYS) {
			const raw = groups.names[key];
			if (raw === undefined) continue;
			const name = readRegister(raw, isStringOrNull);
			if (name) replica.names[key] = name;
			else skip();
		}
	}

	const prefs = isRecord(value.prefs) ? value.prefs : {};
	const defaultFolded = readRegister(prefs.defaultFolded, isBoolean);
	if (defaultFolded) replica.prefs.defaultFolded = defaultFolded;
	const cardMaxHeight = readRegister(prefs.cardMaxHeight, isFiniteNumber);
	if (cardMaxHeight) replica.prefs.cardMaxHeight = cardMaxHeight;
	const inboxFolder = readRegister(prefs.inboxFolder, isString);
	if (inboxFolder) replica.prefs.inboxFolder = inboxFolder;

	if (isRecord(value.devices)) {
		for (const [id, raw] of Object.entries(value.devices)) {
			if (!isDeviceId(id) || !isRecord(raw)) {
				skip();
				continue;
			}
			const state: DeviceState = {};
			const name = readRegister(raw.name, isString);
			if (name) state.name = name;
			if (isStamp(raw.seen)) state.seen = raw.seen;
			replica.devices[id] = state;
		}
	}
	return { replica: normalize(replica), damaged };
}
