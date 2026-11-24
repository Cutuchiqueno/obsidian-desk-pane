import { mergeAll } from './replica';
import type { Replica } from './replica';
import { deviceOfKey, readReplicas, replicaKey, serializeReplica } from './format';
import type { Stamp } from './hlc';

/** What `data.json` holds, read through the plugin's own `loadData`. */
export interface DiskState {
	/** Every readable replica, by key. */
	replicas: Map<string, Replica>;
	/** All of them merged. */
	merged: Replica;
	/** The merge of the replicas other devices wrote. */
	foreign: Replica;
	newerFormat: boolean;
	damaged: boolean;
}

/**
 * Reads and writes the replicas in `data.json`. A write puts exactly one key there,
 * `replica:<device>@<generation>`, new every time: no key ever appears on two devices, so when
 * Obsidian Sync merges two versions of the file, every replica survives whichever side it favors.
 */
export class ReplicaFile {
	constructor(
		private readonly load: () => Promise<unknown>,
		private readonly save: (data: unknown) => Promise<void>,
	) {}

	/** `null` when the file couldn't be read; the caller then works from what it has. */
	async read(device: string): Promise<DiskState | null> {
		let data: unknown;
		try {
			data = await this.load();
		} catch {
			return null;
		}
		const { replicas, newerFormat, damaged } = readReplicas(data);
		const foreign = [...replicas].filter(([key]) => deviceOfKey(key) !== device).map(([, replica]) => replica);
		return {
			replicas,
			merged: mergeAll([...replicas.values()]),
			foreign: mergeAll(foreign),
			newerFormat,
			damaged,
		};
	}

	async write(device: string, stamp: Stamp, replica: Replica): Promise<void> {
		await this.save({ [replicaKey(device, stamp)]: serializeReplica(replica) });
	}
}
