/**
 * Hybrid logical clock stamps: wall time in milliseconds, a counter for events within the same
 * millisecond, and the device that made the stamp. Fixed-width base36 fields make plain string
 * comparison order them, so a stamp is just a string.
 *
 * A device's clock never runs behind anything it has seen. A change made after reading another
 * device's change therefore always carries the later stamp, whatever the two devices' clocks say.
 */

export type Stamp = string;

const WALL_WIDTH = 9;
const COUNTER_WIDTH = 4;
const COUNTER_MAX = 36 ** COUNTER_WIDTH - 1;

const STAMP_PATTERN = /^[0-9a-z]{9}-[0-9a-z]{4}-[0-9a-z]{1,16}$/;
const DEVICE_PATTERN = /^[0-9a-z]{1,16}$/;

export interface StampParts {
	wall: number;
	counter: number;
	device: string;
}

export function isDeviceId(value: unknown): value is string {
	return typeof value === 'string' && DEVICE_PATTERN.test(value);
}

export function isStamp(value: unknown): value is Stamp {
	return typeof value === 'string' && STAMP_PATTERN.test(value);
}

export function formatStamp({ wall, counter, device }: StampParts): Stamp {
	const wallPart = Math.max(0, Math.floor(wall)).toString(36).padStart(WALL_WIDTH, '0');
	return `${wallPart}-${counter.toString(36).padStart(COUNTER_WIDTH, '0')}-${device}`;
}

export function parseStamp(stamp: Stamp): StampParts {
	const [wall = '0', counter = '0', device = ''] = stamp.split('-');
	return { wall: parseInt(wall, 36), counter: parseInt(counter, 36), device };
}

/** The wall time a stamp was made at, in milliseconds. */
export function wallOf(stamp: Stamp): number {
	return parseStamp(stamp).wall;
}

/** Wall time and counter, without the device: unique for every stamp one device makes. */
export function generationOf(stamp: Stamp): string {
	return stamp.slice(0, WALL_WIDTH + 1 + COUNTER_WIDTH).replace('-', '');
}

export function compareStamps(a: Stamp, b: Stamp): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

export function maxStamp(a: Stamp | undefined, b: Stamp | undefined): Stamp | undefined {
	if (a === undefined) return b;
	if (b === undefined) return a;
	return a >= b ? a : b;
}

/** The stamp every migrated value gets, so anything a device actually did wins over it. */
export function minimalStamp(device: string): Stamp {
	return formatStamp({ wall: 0, counter: 0, device });
}

/** The next stamp after `parts` in the same millisecond, carrying into the wall time on overflow. */
function successor(parts: StampParts, device: string): Stamp {
	return parts.counter < COUNTER_MAX
		? formatStamp({ wall: parts.wall, counter: parts.counter + 1, device })
		: formatStamp({ wall: parts.wall + 1, counter: 0, device });
}

/**
 * The smallest stamp of `device` that is later than `stamp`. A change derived from something the
 * device saw — a note renamed or deleted on any device — is stamped this way, so it overrides what
 * was seen and nothing a device did after it.
 */
export function bump(stamp: Stamp, device: string): Stamp {
	return successor(parseStamp(stamp), device);
}

export class HybridClock {
	private last: StampParts;

	constructor(
		readonly device: string,
		private readonly now: () => number = Date.now,
	) {
		this.last = { wall: 0, counter: 0, device };
	}

	/** A stamp later than every stamp this clock has made or seen. */
	tick(): Stamp {
		const wall = this.now();
		const stamp =
			wall > this.last.wall
				? formatStamp({ wall, counter: 0, device: this.device })
				: successor(this.last, this.device);
		this.last = parseStamp(stamp);
		return stamp;
	}

	/** Moves the clock past a stamp it read, so its next tick is later than that stamp. */
	observe(stamp: Stamp | undefined): void {
		if (stamp === undefined || !isStamp(stamp)) return;
		const parts = parseStamp(stamp);
		if (parts.wall > this.last.wall || (parts.wall === this.last.wall && parts.counter > this.last.counter)) {
			this.last = { wall: parts.wall, counter: parts.counter, device: this.device };
		}
	}

	/** The latest wall time and counter this clock has made or seen, as a stamp of its own device. */
	get latest(): Stamp {
		return formatStamp(this.last);
	}
}
