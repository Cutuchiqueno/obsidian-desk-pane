/**
 * Test helpers: simulated devices that change their desk the way the store does and exchange
 * replicas. Only tests import this module, so it never reaches the plugin bundle.
 */

import { entryKey } from '../model';
import type { DeskColor, DeskEntry } from '../model';
import { HybridClock } from './hlc';
import type { Stamp } from './hlc';
import { emptyReplica, latestStamp, materialize, merge } from './replica';
import type { DeskState, Prefs, Replica } from './replica';
import { recordDelete, recordLocal, recordRename } from './changes';

export const DEFAULT_PREFS: Prefs = { defaultFolded: true, cardMaxHeight: 50, inboxFolder: '' };

/** Wall time all simulated devices share, advanced a second per change unless a test skews it. */
export class World {
	now = Date.UTC(2026, 10, 24, 12);

	advance(ms = 1000): number {
		this.now += ms;
		return this.now;
	}
}

export class Device {
	replica: Replica = emptyReplica();
	readonly clock: HybridClock;
	/** Added to the world's time, for a device whose clock is off. */
	skew = 0;

	constructor(
		readonly id: string,
		private readonly world: World,
	) {
		this.clock = new HybridClock(id, () => this.world.now + this.skew);
	}

	get desk(): DeskState {
		return materialize(this.replica, DEFAULT_PREFS);
	}

	get keys(): string[] {
		return this.desk.entries.map(entryKey);
	}

	card(key: string): DeskEntry | undefined {
		return this.desk.entries.find((entry) => entryKey(entry) === key);
	}

	tick(): Stamp {
		this.world.advance();
		return this.clock.tick();
	}

	/** A local change, made to a copy of the desk as the store would, then recorded as a patch. */
	change(edit: (desk: DeskState) => void, reassert: string[] = []): Replica | null {
		const next = cloneDesk(this.desk);
		edit(next);
		const patch = recordLocal(this.replica, next, this.tick(), DEFAULT_PREFS, new Set(reassert));
		if (patch) this.replica = merge(this.replica, patch);
		return patch;
	}

	add(path: string, index = 0, collapsed = false): void {
		this.change((desk) => {
			const entries = desk.entries.filter((entry) => entryKey(entry) !== path);
			entries.splice(index, 0, { path, collapsed });
			desk.entries = entries;
		}, [path]);
	}

	remove(key: string): void {
		this.change((desk) => {
			desk.entries = desk.entries.filter((entry) => entryKey(entry) !== key);
		});
	}

	move(key: string, index: number): void {
		this.change((desk) => {
			const entry = desk.entries.find((candidate) => entryKey(candidate) === key);
			if (!entry) return;
			const rest = desk.entries.filter((candidate) => candidate !== entry);
			rest.splice(index, 0, entry);
			desk.entries = rest;
		});
	}

	fold(key: string, collapsed: boolean): void {
		this.change((desk) => {
			const entry = desk.entries.find((candidate) => entryKey(candidate) === key);
			if (entry) entry.collapsed = collapsed;
		});
	}

	color(key: string, color: DeskColor | undefined): void {
		this.change((desk) => {
			const entry = desk.entries.find((candidate) => entryKey(candidate) === key);
			if (entry) entry.color = color;
			// The store re-sorts into color blocks while grouped.
			if (desk.grouped) desk.entries.sort((a, b) => rank(a) - rank(b));
		});
	}

	group(grouped: boolean): void {
		this.change((desk) => {
			desk.grouped = grouped;
			if (grouped) desk.entries.sort((a, b) => rank(a) - rank(b));
		});
	}

	clear(): void {
		this.change((desk) => {
			desk.entries = [];
		});
	}

	rename(oldPath: string, newPath: string): void {
		const patch = recordRename(this.replica, oldPath, newPath, this.id);
		if (patch) this.apply(patch);
	}

	deleteNote(path: string): void {
		const patch = recordDelete(this.replica, path, this.id);
		if (patch) this.apply(patch);
	}

	apply(patch: Replica): void {
		this.replica = merge(this.replica, patch);
		this.clock.observe(latestStamp(patch));
	}

	/** Takes in another device's state, as reading its replica from `data.json` would. */
	receive(...others: (Device | Replica)[]): void {
		for (const other of others) {
			const replica = other instanceof Device ? other.replica : other;
			this.replica = merge(this.replica, replica);
			this.clock.observe(latestStamp(replica));
		}
	}
}

/** Both devices see each other's state. */
export function exchange(a: Device, b: Device): void {
	const before = a.replica;
	a.receive(b);
	b.receive(before);
}

function rank(entry: { color?: DeskColor }): number {
	const order: (DeskColor | undefined)[] = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', undefined];
	return order.indexOf(entry.color);
}

export function cloneDesk(desk: DeskState): DeskState {
	return {
		entries: desk.entries.map((entry) => ({ ...entry })),
		grouped: desk.grouped,
		names: { ...desk.names },
		prefs: { ...desk.prefs },
	};
}

/** A small seeded random generator, so failing random tests can be replayed. */
export function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
