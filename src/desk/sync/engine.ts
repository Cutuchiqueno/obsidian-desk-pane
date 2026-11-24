import { Notice } from 'obsidian';
import type DeskPlugin from '../../main';
import { entryKey } from '../model';
import type { DeskStore } from '../store';
import type { DeskChange } from '../types';
import type { DeviceStore } from './device';
import { HybridClock, wallOf } from './hlc';
import { ReplicaFile } from './persist';
import type { DiskState } from './persist';
import { contains, emptyReplica, latestStamp, materialize, merge, sameDeskState } from './replica';
import type { DeskState, Prefs, Replica } from './replica';
import {
	applyReturnerRule,
	collectGarbage,
	fromDeskState,
	recordDelete,
	recordLocal,
	recordRename,
} from './changes';

/** Changes made in quick succession — a drag, a run of folds — go out as one write. */
const LOCAL_WRITE_DELAY = 2500;
/**
 * Every device reacts to a renamed or deleted note at nearly the same moment, and two writes that
 * close together can skip Obsidian Sync's merge. A longer, randomized delay makes that rarer; when
 * it happens anyway, nothing is lost, as every device derived the same change.
 */
const DERIVED_WRITE_DELAY = 5000;
const DERIVED_WRITE_JITTER = 3000;
/** When the file lacks this device's state, it writes again soon. */
const REWRITE_DELAY = 1000;
const RETRY_DELAY = 10_000;
/** Obsidian Sync delivers a rename as a delete and a create, about a second apart. */
const DELETE_DELAY = 5000;
/** A device that changes nothing still writes once a day, so the device list shows it's there. */
const HEARTBEAT = 24 * 60 * 60 * 1000;
const HEARTBEAT_CHECK = 60 * 60 * 1000;
const CLOCK_AHEAD = 5 * 60 * 1000;

export interface SyncedDevice {
	id: string;
	name: string;
	/** Wall time of the device's latest write. */
	seen?: number;
	isThisDevice: boolean;
	clockAhead: boolean;
}

/**
 * Keeps the desk in step with the other devices that sync the vault. The store keeps working on its
 * plain list; every change it commits arrives here as a patch to the replica, and every change that
 * arrives from other devices goes back to the store as a whole new desk.
 *
 * `basis` is the replica the store currently shows. Local changes are diffed against it, so changes
 * from other devices that arrived during a drag, and aren't shown yet, are never taken for undone.
 */
export class SyncEngine {
	active = false;
	private replica: Replica = emptyReplica();
	private basis: Replica = emptyReplica();
	private deviceId = '';
	private clock = new HybridClock('pending');
	private readonly file: ReplicaFile;
	private writeTimer: number | null = null;
	private writeDue = Infinity;
	private writing: Promise<void> = Promise.resolve();
	private presentPending = false;
	/** Set while starting, so a change Sync delivers meanwhile is read once the start is done. */
	private starting: Promise<void> | null = null;
	private readonly deleteTimers = new Map<string, number>();
	private readonly warned = { newer: false, damaged: false };
	/** Called when another device appears, writes, or is renamed, for the list in the settings. */
	onDevicesChanged: (() => void) | null = null;
	private othersSeen = '';

	constructor(
		private readonly plugin: DeskPlugin,
		private readonly store: DeskStore,
		private readonly device: DeviceStore,
		private readonly defaults: Prefs,
	) {
		this.file = new ReplicaFile(
			() => plugin.loadData(),
			(data) => plugin.saveRawData(data),
		);
		store.gestureEnded = () => {
			if (this.presentPending) this.present();
		};
		plugin.registerInterval(
			window.setInterval(() => {
				if (this.active && this.heartbeatDue()) this.scheduleWrite(0, false);
			}, HEARTBEAT_CHECK),
		);
	}

	/**
	 * Starts syncing on this device. Turning it on (`migrate`) brings in the desk as it was, stamped
	 * so that whatever the other devices already synced wins and only cards they don't know join.
	 */
	async start(migrate: boolean): Promise<void> {
		this.starting = this.begin(migrate);
		try {
			await this.starting;
		} finally {
			this.starting = null;
		}
	}

	private async begin(migrate: boolean): Promise<void> {
		this.deviceId = this.device.deviceId;
		this.clock = new HybridClock(this.deviceId);
		let own = this.device.loadBackup() ?? emptyReplica();
		if (migrate) {
			const state = this.store.snapshot();
			this.device.saveDeskBeforeSync(state);
			for (const entry of state.entries) this.device.setHeight(entryKey(entry), entry.previewHeight);
			own = merge(own, fromDeskState(state, this.deviceId));
		}
		const disk = await this.file.read(this.deviceId);
		if (disk) {
			this.warn(disk);
			own = applyReturnerRule(own, disk.foreign, this.deviceId, Date.now());
		}
		this.replica = collectGarbage(disk ? merge(own, disk.merged) : own, Date.now());
		this.clock.observe(latestStamp(this.replica));
		this.active = true;
		this.present();
		this.noticeDevices();
		this.device.saveBackup(this.replica);
		if (!disk || !contains(disk.merged, this.replica) || this.heartbeatDue()) {
			this.scheduleWrite(REWRITE_DELAY, false);
		}
	}

	/** Stops syncing here. The store keeps the desk; the caller writes it back the old way. */
	async stop(): Promise<void> {
		if (!this.active) return;
		this.clearTimers();
		this.active = false;
		await this.writing;
		this.device.clearBackup();
	}

	/** On unload: runs what is pending now rather than dropping it. */
	unload(): void {
		if (!this.active) return;
		for (const [path, timer] of this.deleteTimers) {
			window.clearTimeout(timer);
			if (!this.plugin.app.vault.getAbstractFileByPath(path)) this.store.removeNote(path);
		}
		this.deleteTimers.clear();
		if (this.writeTimer !== null) {
			window.clearTimeout(this.writeTimer);
			this.writeTimer = null;
			// The backup in local storage covers a write the closing app doesn't finish.
			void this.writing.then(() => this.flush()).catch(() => undefined);
		}
	}

	// --- changes from the store -----------------------------------------------------------------

	/** Records a change the store just committed. */
	record(change: DeskChange): void {
		if (!this.active) return;
		let patch: Replica | null;
		let derived = false;
		switch (change.type) {
			case 'resize':
				// Card heights stay on this device.
				this.device.setHeight(change.key, this.store.get(change.key)?.previewHeight);
				return;
			case 'sync':
				return;
			case 'rename':
				patch = recordRename(this.replica, change.oldPath, change.newPath, this.deviceId);
				this.device.renameHeights(change.oldPath, change.newPath);
				derived = true;
				break;
			case 'delete':
				patch = recordDelete(this.replica, change.path, this.deviceId);
				derived = true;
				break;
			default: {
				const reassert = new Set(change.type === 'add' ? [change.key] : []);
				patch = recordLocal(this.basis, this.store.snapshot(), this.clock.tick(), this.defaults, reassert);
			}
		}
		if (!patch) return;
		this.replica = merge(this.replica, patch);
		this.basis = merge(this.basis, patch);
		this.clock.observe(latestStamp(patch));
		this.device.saveBackup(this.replica);
		if (derived) this.scheduleWrite(DERIVED_WRITE_DELAY + Math.random() * DERIVED_WRITE_JITTER, false);
		else this.scheduleWrite(LOCAL_WRITE_DELAY, true);
	}

	/** After a commit: puts the store back in step if it shows something the replica doesn't. */
	reconcile(): void {
		if (!this.active || this.store.gestureActive) return;
		const state = this.materialized(this.basis);
		if (!sameDeskState(state, this.store.snapshot())) this.store.applySynced(state);
		this.device.pruneHeights(new Set(state.entries.map(entryKey)));
	}

	/** A note deleted from the vault leaves the desk after a pause, unless it turns up again. */
	scheduleDelete(path: string): void {
		const pending = this.deleteTimers.get(path);
		if (pending !== undefined) window.clearTimeout(pending);
		const timer = window.setTimeout(() => {
			this.deleteTimers.delete(path);
			if (!this.plugin.app.vault.getAbstractFileByPath(path)) this.store.removeNote(path);
		}, DELETE_DELAY);
		this.deleteTimers.set(path, timer);
	}

	// --- changes from other devices -------------------------------------------------------------

	/** Obsidian Sync changed `data.json`. */
	async onExternalChange(): Promise<void> {
		// Obsidian loads plugins before Sync's first download, so this can come while starting.
		if (this.starting) await this.starting.catch(() => undefined);
		if (!this.active) return;
		const disk = await this.file.read(this.deviceId);
		if (!disk || !this.active) return;
		this.warn(disk);
		if (this.absorb(disk)) this.present();
		this.noticeDevices();
		this.device.saveBackup(this.replica);
		// Sync replaced the file with one lacking what this device knows: write it again.
		if (!contains(disk.merged, this.replica)) this.scheduleWrite(REWRITE_DELAY, false);
	}

	/** Merges what is on disk; whether that changed the desk. */
	private absorb(disk: DiskState): boolean {
		this.detectDuplicateId(disk);
		const before = this.replica;
		this.replica = merge(this.replica, disk.merged);
		this.clock.observe(latestStamp(disk.merged));
		return !contains(before, this.replica);
	}

	/** Shows the replica in the store, or waits until a drag or resize is over. */
	private present(): void {
		if (this.store.gestureActive) {
			this.presentPending = true;
			return;
		}
		this.presentPending = false;
		this.basis = this.replica;
		const state = this.materialized(this.replica);
		if (!sameDeskState(state, this.store.snapshot())) this.store.applySynced(state);
	}

	private materialized(replica: Replica): DeskState {
		const state = materialize(replica, this.defaults);
		state.entries = state.entries.map((entry) => {
			const height = this.device.height(entryKey(entry));
			return height === undefined ? entry : { ...entry, previewHeight: height };
		});
		return state;
	}

	/**
	 * Stamps of this device's ID later than any it made mean another installation uses the ID —
	 * a restored backup, or a phone moved over with its app data. This one takes a new ID.
	 */
	private detectDuplicateId(disk: DiskState): void {
		const mine = latestStamp(disk.merged, this.deviceId);
		if (mine === undefined || mine <= this.clock.latest) return;
		this.deviceId = this.device.renewDeviceId();
		this.clock = new HybridClock(this.deviceId);
		this.clock.observe(latestStamp(merge(this.replica, disk.merged)));
	}

	// --- writing --------------------------------------------------------------------------------

	/**
	 * `debounce` pushes a pending write back, for changes that come in runs; otherwise an earlier
	 * pending write is kept.
	 */
	private scheduleWrite(delay: number, debounce: boolean): void {
		const due = Date.now() + delay;
		if (this.writeTimer !== null) {
			if (!debounce && this.writeDue <= due) return;
			window.clearTimeout(this.writeTimer);
		}
		this.writeDue = due;
		this.writeTimer = window.setTimeout(() => {
			this.writeTimer = null;
			this.writeDue = Infinity;
			this.writing = this.writing.then(() => this.flush()).catch(() => this.scheduleWrite(RETRY_DELAY, false));
		}, delay);
	}

	/** Reads, merges, and writes this device's replica as one new key. */
	private async flush(): Promise<void> {
		if (!this.active) return;
		const disk = await this.file.read(this.deviceId);
		if (!this.active) return;
		if (disk) {
			this.warn(disk);
			if (this.absorb(disk)) this.present();
		}
		this.replica = collectGarbage(this.replica, Date.now());
		const stamp = this.clock.tick();
		const own = this.replica.devices[this.deviceId];
		this.replica = {
			...this.replica,
			devices: {
				...this.replica.devices,
				[this.deviceId]: { name: own?.name ?? [this.device.defaultName(), stamp], seen: stamp },
			},
		};
		this.device.saveBackup(this.replica);
		await this.file.write(this.deviceId, stamp, this.replica);
	}

	/**
	 * Tells the settings when the other devices changed. Not for this device's own writes: the list
	 * would re-render on every one of them, and pull the cursor out of the device name field.
	 */
	private noticeDevices(): void {
		const others = this.devices
			.filter((device) => !device.isThisDevice)
			.map((device) => [device.id, device.name, device.seen]);
		const summary = JSON.stringify(others);
		if (summary === this.othersSeen) return;
		this.othersSeen = summary;
		this.onDevicesChanged?.();
	}

	private heartbeatDue(): boolean {
		const seen = this.replica.devices[this.deviceId]?.seen;
		return seen === undefined || Date.now() - wallOf(seen) > HEARTBEAT;
	}

	private clearTimers(): void {
		if (this.writeTimer !== null) window.clearTimeout(this.writeTimer);
		this.writeTimer = null;
		this.writeDue = Infinity;
		for (const timer of this.deleteTimers.values()) window.clearTimeout(timer);
		this.deleteTimers.clear();
	}

	private warn(disk: DiskState): void {
		if (disk.newerFormat && !this.warned.newer) {
			this.warned.newer = true;
			new Notice('Another device syncs the desk with a newer version of this plugin. Update it here to keep the desk in sync.');
		}
		if (disk.damaged && !this.warned.damaged) {
			this.warned.damaged = true;
			new Notice('Part of the synced desk could not be read and was skipped.');
		}
	}

	// --- devices --------------------------------------------------------------------------------

	get deviceName(): string {
		return this.replica.devices[this.deviceId]?.name?.[0] ?? this.device.defaultName();
	}

	setDeviceName(name: string): void {
		if (!this.active) return;
		const trimmed = name.trim() || this.device.defaultName();
		if (trimmed === this.deviceName) return;
		const own = this.replica.devices[this.deviceId] ?? {};
		this.replica = {
			...this.replica,
			devices: { ...this.replica.devices, [this.deviceId]: { ...own, name: [trimmed, this.clock.tick()] } },
		};
		this.device.saveBackup(this.replica);
		this.scheduleWrite(LOCAL_WRITE_DELAY, true);
	}

	/** The devices that synced this desk, this one first, then the most recently seen. */
	get devices(): SyncedDevice[] {
		const now = Date.now();
		const listed = Object.entries(this.replica.devices).map(([id, state]) => {
			const seen = state.seen === undefined ? undefined : wallOf(state.seen);
			return {
				id,
				name: state.name?.[0] ?? (id === this.deviceId ? this.device.defaultName() : 'Unnamed device'),
				seen,
				isThisDevice: id === this.deviceId,
				clockAhead: seen !== undefined && seen > now + CLOCK_AHEAD,
			};
		});
		if (!listed.some((device) => device.isThisDevice)) {
			listed.push({ id: this.deviceId, name: this.deviceName, seen: undefined, isThisDevice: true, clockAhead: false });
		}
		return listed.sort(
			(a, b) => Number(b.isThisDevice) - Number(a.isThisDevice) || (b.seen ?? 0) - (a.seen ?? 0),
		);
	}
}
