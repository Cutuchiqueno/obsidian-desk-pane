import { Platform } from 'obsidian';
import type { App } from 'obsidian';
import type { DeskState, Replica } from './replica';
import { parseReplica, serializeReplica } from './format';
import { isDeviceId } from './hlc';

/** localStorage is per vault and per device, and Obsidian Sync never carries it. */
const KEY = {
	enabled: 'desk-sidebar-sync-enabled',
	device: 'desk-sidebar-sync-device',
	heights: 'desk-sidebar-card-heights',
	backup: 'desk-sidebar-sync-backup',
	legacy: 'desk-sidebar-desk-before-sync',
} as const;

function randomDeviceId(): string {
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => (byte % 36).toString(36)).join('');
}

/**
 * Everything the desk keeps on this device only: whether it syncs here, the device's ID, the card
 * heights dragged here, and a backup of the device's replica. Every access is guarded: storage can
 * be full, blocked, or cleared, and none of that may break a change to the desk.
 */
export class DeviceStore {
	private heights: Record<string, number> | null = null;

	constructor(private readonly app: App) {}

	get syncEnabled(): boolean {
		return this.read(KEY.enabled) === true;
	}

	set syncEnabled(enabled: boolean) {
		// Obsidian removes the entry for a falsy value.
		this.write(KEY.enabled, enabled || null);
	}

	/** This device's ID, made the first time sync needs it. */
	get deviceId(): string {
		const stored = this.read(KEY.device);
		if (isDeviceId(stored) && stored.length === 8) return stored;
		return this.renewDeviceId();
	}

	/** A fresh ID, for when another installation turned out to use this one's. */
	renewDeviceId(): string {
		const id = randomDeviceId();
		this.write(KEY.device, id);
		return id;
	}

	/** A name for the device list until the user gives one. */
	defaultName(): string {
		if (Platform.isIosApp) return Platform.isTablet ? 'iPad' : 'iPhone';
		if (Platform.isAndroidApp) return Platform.isTablet ? 'Android tablet' : 'Android phone';
		if (Platform.isMacOS) return 'Mac';
		if (Platform.isWin) return 'Windows';
		if (Platform.isLinux) return 'Linux';
		return 'Device';
	}

	// --- card heights, which stay on this device ------------------------------------------------

	height(key: string): number | undefined {
		return this.loadHeights()[key];
	}

	setHeight(key: string, height: number | undefined): void {
		const heights = this.loadHeights();
		if (heights[key] === height) return;
		if (height === undefined) delete heights[key];
		else heights[key] = height;
		this.saveHeights();
	}

	/** Heights follow a renamed note's cards, headings and blocks included. */
	renameHeights(oldPath: string, newPath: string): void {
		const heights = this.loadHeights();
		let changed = false;
		for (const key of Object.keys(heights)) {
			if (key !== oldPath && !key.startsWith(`${oldPath}#`)) continue;
			heights[newPath + key.slice(oldPath.length)] = heights[key]!;
			delete heights[key];
			changed = true;
		}
		if (changed) this.saveHeights();
	}

	/** Forgets the heights of cards no longer on the desk. */
	pruneHeights(keys: ReadonlySet<string>): void {
		const heights = this.loadHeights();
		const stale = Object.keys(heights).filter((key) => !keys.has(key));
		if (stale.length === 0) return;
		for (const key of stale) delete heights[key];
		this.saveHeights();
	}

	private loadHeights(): Record<string, number> {
		if (this.heights) return this.heights;
		const stored = this.read(KEY.heights);
		const heights: Record<string, number> = {};
		if (stored !== null && typeof stored === 'object' && !Array.isArray(stored)) {
			for (const [key, value] of Object.entries(stored)) {
				if (typeof value === 'number' && Number.isFinite(value) && value > 0) heights[key] = value;
			}
		}
		this.heights = heights;
		return heights;
	}

	private saveHeights(): void {
		this.write(KEY.heights, Object.keys(this.loadHeights()).length > 0 ? this.heights : null);
	}

	// --- backups --------------------------------------------------------------------------------

	loadBackup(): Replica | null {
		const parsed = parseReplica(this.read(KEY.backup));
		return parsed && parsed !== 'newer' ? parsed.replica : null;
	}

	saveBackup(replica: Replica): void {
		this.write(KEY.backup, serializeReplica(replica));
	}

	clearBackup(): void {
		this.write(KEY.backup, null);
	}

	/** The desk as it was when sync was turned on here, kept in case the merge surprises. */
	saveDeskBeforeSync(state: DeskState): void {
		this.write(KEY.legacy, { savedAt: Date.now(), ...state });
	}

	private read(key: string): unknown {
		try {
			return this.app.loadLocalStorage(key) as unknown;
		} catch {
			return null;
		}
	}

	/** Fails silently: the backup is a fallback, and the desk works without it. */
	private write(key: string, value: unknown): void {
		try {
			this.app.saveLocalStorage(key, value);
		} catch {
			// Storage full or blocked; nothing else depends on it succeeding.
		}
	}
}
