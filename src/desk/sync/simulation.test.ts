/**
 * Runs three devices against a simulated Obsidian Sync that behaves as the pre-test measured it
 * (2026-11-24): a plain upload replaces the file; a device with a pending change that finds a newer
 * remote version merges top-level keys shallowly, where on equal keys the remote side won in the
 * test and the local side wins per the docs; and two devices writing at nearly the same time can
 * skip the merge, so the last upload wins. Devices follow the engine's rules: write one replica key
 * per write, merge every replica key they read, and write again when the file lacks their state.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contains, mergeAll, stableJson } from './replica';
import type { Replica } from './replica';
import { readReplicas, replicaKey, serializeReplica } from './format';
import { Device, seededRandom, World } from './testing';

type DataJson = Record<string, unknown>;

class Server {
	file: DataJson = {};
	version = 0;
}

class SimDevice {
	readonly device: Device;
	/** What the device's localStorage backup holds. */
	backup: Replica;
	disk: DataJson = {};
	syncedVersion = 0;
	dirty = false;

	constructor(
		id: string,
		world: World,
		private readonly server: Server,
	) {
		this.device = new Device(id, world);
		this.backup = this.device.replica;
	}

	/** One write: a single key with a new generation, holding everything the device knows. */
	write(): void {
		const stamp = this.device.clock.tick();
		this.disk = {
			[replicaKey(this.device.id, stamp)]: JSON.parse(JSON.stringify(serializeReplica(this.device.replica))) as unknown,
		};
		this.dirty = true;
	}

	afterLocalChange(): void {
		this.backup = this.device.replica;
		this.write();
	}

	/** Sync changed `data.json` under the running plugin. */
	onExternalChange(): void {
		const onDisk = [...readReplicas(this.disk).replicas.values()];
		this.device.receive(...onDisk);
		this.backup = this.device.replica;
		if (!contains(mergeAll(onDisk), this.device.replica)) this.write();
	}

	/** Obsidian restarts: memory is gone, the backup and the file on disk stay. */
	restart(): void {
		this.device.replica = this.backup;
		const onDisk = [...readReplicas(this.disk).replicas.values()];
		this.device.receive(...onDisk);
		this.backup = this.device.replica;
		if (!contains(mergeAll(onDisk), this.device.replica)) this.write();
	}

	upload(mode: 'normal' | 'race', remoteWins: boolean): void {
		if (!this.dirty) return;
		const server = this.server;
		if (mode === 'race' || this.syncedVersion === server.version) {
			server.file = this.disk;
			server.version++;
			this.syncedVersion = server.version;
			this.dirty = false;
			return;
		}
		const merged = remoteWins ? { ...this.disk, ...server.file } : { ...server.file, ...this.disk };
		server.file = merged;
		server.version++;
		this.disk = { ...merged };
		this.syncedVersion = server.version;
		this.dirty = false;
		this.onExternalChange();
	}

	download(): void {
		if (this.dirty || this.syncedVersion === this.server.version) return;
		this.disk = { ...this.server.file };
		this.syncedVersion = this.server.version;
		this.onExternalChange();
	}
}

function plain(replica: Replica): string {
	return stableJson(serializeReplica({ ...replica, devices: {} }));
}

function runScenario(seed: number, steps: number): void {
	const random = seededRandom(seed);
	const world = new World();
	const server = new Server();
	const sims = ['aaaa', 'bbbb', 'cccc'].map((id) => new SimDevice(id, world, server));
	const paths = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md'];
	const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
	const everything: Replica[] = [];

	for (let step = 0; step < steps; step++) {
		const sim = pick(sims);
		const device = sim.device;
		const path = pick(paths);
		const roll = random();
		if (roll < 0.45) {
			const op = random();
			if (op < 0.3) device.add(path, Math.floor(random() * 3));
			else if (op < 0.45) device.remove(path);
			else if (op < 0.6) device.move(path, Math.floor(random() * 4));
			else if (op < 0.7) device.fold(path, random() < 0.5);
			else if (op < 0.8) device.color(path, pick(['red', 'green', undefined] as const));
			else if (op < 0.85) device.group(random() < 0.5);
			else if (op < 0.93) device.rename(path, pick(paths));
			else device.deleteNote(path);
			everything.push(device.replica);
			sim.afterLocalChange();
		} else if (roll < 0.65) {
			sim.upload(random() < 0.25 ? 'race' : 'normal', random() < 0.7);
		} else if (roll < 0.9) {
			sim.download();
		} else if (roll < 0.95) {
			sim.restart();
		} else {
			world.advance(Math.floor(random() * 60_000));
		}
	}

	// Let Sync settle: upload what is pending, download what is newer, until nothing changes.
	for (let round = 0; round < 50; round++) {
		for (const sim of sims) sim.upload('normal', random() < 0.7);
		for (const sim of sims) sim.download();
		if (sims.every((sim) => !sim.dirty && sim.syncedVersion === server.version)) break;
	}
	assert.ok(
		sims.every((sim) => !sim.dirty && sim.syncedVersion === server.version),
		`seed ${seed}: sync did not settle`,
	);

	const finals = sims.map((sim) => plain(sim.device.replica));
	assert.equal(new Set(finals).size, 1, `seed ${seed}: devices disagree`);
	const final = sims[0]!.device.replica;
	for (const known of everything) {
		assert.ok(contains(final, known), `seed ${seed}: a change got lost`);
	}
}

describe('sync over a simulated Obsidian Sync', () => {
	// SIM_SEED replays one seed; SIM_MAX runs more of them than the default.
	it('converges without losing a change, whichever side wins a merge and whatever races', () => {
		const first = Number(process.env.SIM_SEED ?? 1);
		const last = Number(process.env.SIM_SEED ?? process.env.SIM_MAX ?? 300);
		for (let seed = first; seed <= last; seed++) runScenario(seed, 80);
	});
});
