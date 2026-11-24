import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	bump,
	compareStamps,
	formatStamp,
	generationOf,
	HybridClock,
	isStamp,
	maxStamp,
	minimalStamp,
	parseStamp,
	wallOf,
} from './hlc';

describe('stamps', () => {
	it('order by wall time, then counter, then device, as plain strings', () => {
		const a = formatStamp({ wall: 1000, counter: 0, device: 'aaaa' });
		const b = formatStamp({ wall: 1000, counter: 1, device: 'aaaa' });
		const c = formatStamp({ wall: 1001, counter: 0, device: 'aaaa' });
		const d = formatStamp({ wall: 1001, counter: 0, device: 'bbbb' });
		assert.deepEqual([d, c, b, a].sort(), [a, b, c, d]);
		assert.equal(compareStamps(a, b), -1);
		assert.equal(maxStamp(c, d), d);
		assert.equal(maxStamp(undefined, a), a);
	});

	it('round-trip through formatting and parsing', () => {
		const stamp = formatStamp({ wall: Date.UTC(2026, 10, 24), counter: 7, device: 'k3x9q2m1' });
		assert.ok(isStamp(stamp));
		assert.deepEqual(parseStamp(stamp), { wall: Date.UTC(2026, 10, 24), counter: 7, device: 'k3x9q2m1' });
		assert.equal(wallOf(stamp), Date.UTC(2026, 10, 24));
	});

	it('keep their width well past this century', () => {
		const stamp = formatStamp({ wall: Date.UTC(2099, 0, 1), counter: 0, device: 'a' });
		assert.ok(isStamp(stamp), stamp);
	});

	it('rank the minimal stamp below any real one', () => {
		assert.ok(minimalStamp('zzzz') < formatStamp({ wall: 1, counter: 0, device: 'aaaa' }));
	});

	it('bump to the next stamp of the given device, later than the original', () => {
		const stamp = formatStamp({ wall: 5000, counter: 3, device: 'zzzz' });
		const bumped = bump(stamp, 'aaaa');
		assert.ok(bumped > stamp);
		assert.deepEqual(parseStamp(bumped), { wall: 5000, counter: 4, device: 'aaaa' });
	});

	it('carry a full counter into the wall time', () => {
		const full = formatStamp({ wall: 5000, counter: 36 ** 4 - 1, device: 'aaaa' });
		const bumped = bump(full, 'aaaa');
		assert.ok(bumped > full);
		assert.deepEqual(parseStamp(bumped), { wall: 5001, counter: 0, device: 'aaaa' });
	});

	it('give every write of a device a distinct generation', () => {
		const a = formatStamp({ wall: 5000, counter: 0, device: 'aaaa' });
		const b = formatStamp({ wall: 5000, counter: 1, device: 'aaaa' });
		assert.notEqual(generationOf(a), generationOf(b));
		assert.match(generationOf(a), /^[0-9a-z]{13}$/);
	});
});

describe('HybridClock', () => {
	it('ticks strictly upward, also when the wall clock stands still or goes back', () => {
		let now = 10_000;
		const clock = new HybridClock('aaaa', () => now);
		const first = clock.tick();
		const second = clock.tick();
		now = 9_000;
		const third = clock.tick();
		now = 20_000;
		const fourth = clock.tick();
		assert.ok(first < second && second < third && third < fourth);
		assert.equal(wallOf(fourth), 20_000);
	});

	it('ticks past every stamp it has observed, however far ahead its maker was', () => {
		const clock = new HybridClock('aaaa', () => 10_000);
		const ahead = formatStamp({ wall: 99_000, counter: 5, device: 'bbbb' });
		clock.observe(ahead);
		const next = clock.tick();
		assert.ok(next > ahead);
		assert.equal(parseStamp(next).device, 'aaaa');
	});

	it('ignores what is not a stamp', () => {
		const clock = new HybridClock('aaaa', () => 10_000);
		clock.observe('nonsense');
		clock.observe(undefined);
		assert.equal(wallOf(clock.tick()), 10_000);
	});
});
