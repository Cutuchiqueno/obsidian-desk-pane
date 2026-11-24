import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatStamp, minimalStamp } from './hlc';
import {
	contains,
	emptyReplica,
	isLive,
	materialize,
	merge,
	sameDeskState,
	stableJson,
} from './replica';
import type { Replica } from './replica';
import {
	applyReturnerRule,
	collectGarbage,
	fromDeskState,
	recordLocal,
	TOMBSTONE_HORIZON_MS,
} from './changes';
import { deviceOfKey, parseReplica, readReplicas, replicaKey, serializeReplica } from './format';
import { DEFAULT_PREFS, Device, exchange, seededRandom, World } from './testing';

function devices(...ids: string[]): Device[] {
	const world = new World();
	return ids.map((id) => new Device(id, world));
}

/** Two devices that share a desk of the given notes, top to bottom. */
function sharedDesk(...paths: string[]): [Device, Device] {
	const [a, b] = devices('aaaa', 'bbbb') as [Device, Device];
	for (const path of [...paths].reverse()) a.add(path);
	b.receive(a);
	return [a, b];
}

function same(a: Replica, b: Replica): boolean {
	return stableJson(serializeReplica(a)) === stableJson(serializeReplica(b));
}

describe('recording local changes', () => {
	it('adds a card on top without writing the order', () => {
		const [a] = sharedDesk('x.md', 'y.md');
		const patch = a.change((desk) => desk.entries.unshift({ path: 'z.md', collapsed: false }));
		assert.ok(patch);
		assert.equal(patch.order, undefined);
		assert.deepEqual(a.keys, ['z.md', 'x.md', 'y.md']);
	});

	it('writes the order when a card moves', () => {
		const [a] = sharedDesk('x.md', 'y.md', 'z.md');
		a.move('z.md', 0);
		assert.deepEqual(a.keys, ['z.md', 'x.md', 'y.md']);
		assert.deepEqual(a.replica.order?.[0], ['z.md', 'x.md', 'y.md']);
	});

	it('folds by writing only the fold register', () => {
		const [a] = sharedDesk('x.md', 'y.md');
		const patch = a.change((desk) => (desk.entries[1]!.collapsed = true));
		assert.ok(patch);
		assert.deepEqual(Object.keys(patch.cards), ['y.md']);
		assert.equal(patch.cards['y.md']?.color, undefined);
		assert.equal(patch.order, undefined);
		assert.equal(patch.grouped, undefined);
	});

	it('removes with a tombstone', () => {
		const [a] = sharedDesk('x.md', 'y.md');
		a.remove('x.md');
		assert.deepEqual(a.keys, ['y.md']);
		assert.ok(a.replica.gone['x.md']);
		assert.equal(isLive(a.replica, 'x.md'), false);
	});

	it('records nothing when nothing changed', () => {
		const [a] = sharedDesk('x.md');
		assert.equal(a.change(() => undefined), null);
	});

	it('groups without writing the order, and keeps the grouped order when ungrouping', () => {
		const [a] = sharedDesk('x.md', 'y.md', 'z.md');
		a.color('z.md', 'red');
		a.group(true);
		assert.deepEqual(a.keys, ['z.md', 'x.md', 'y.md']);
		const orderBefore = a.replica.order;
		a.group(false);
		assert.deepEqual(a.keys, ['z.md', 'x.md', 'y.md']);
		assert.notEqual(a.replica.order, orderBefore);
	});

	it('records settings and group names as registers', () => {
		const [a, b] = sharedDesk('x.md');
		a.change((desk) => {
			desk.prefs.inboxFolder = 'Inbox';
			desk.names.red = 'Urgent';
		});
		b.receive(a);
		assert.equal(b.desk.prefs.inboxFolder, 'Inbox');
		assert.equal(b.desk.names.red, 'Urgent');
	});

	it('leaves alone what another device changed and the store has not shown yet', () => {
		const [a, b] = sharedDesk('x.md', 'y.md');
		b.add('r.md');
		b.move('y.md', 0);
		// `a` folds `x` on the desk it shows, which lacks b's changes, then takes them in.
		const basis = a.replica;
		a.receive(b);
		const next = materialize(basis, DEFAULT_PREFS);
		next.entries[0]!.collapsed = true;
		const patch = recordLocal(basis, next, a.tick(), DEFAULT_PREFS);
		assert.ok(patch);
		a.apply(patch);
		// b put r on top, then moved y above it.
		assert.deepEqual(a.keys, ['y.md', 'r.md', 'x.md']);
		assert.equal(a.card('x.md')?.collapsed, true);
	});
});

describe('conflicts between content', () => {
	it('lets the later value win when both set the same field', () => {
		const [a, b] = sharedDesk('x.md');
		a.color('x.md', 'red');
		b.color('x.md', 'blue');
		exchange(a, b);
		assert.equal(a.card('x.md')?.color, 'blue');
		assert.equal(b.card('x.md')?.color, 'blue');
	});

	it('keeps both when they change different fields of a card', () => {
		const [a, b] = sharedDesk('x.md');
		a.fold('x.md', true);
		b.color('x.md', 'green');
		exchange(a, b);
		assert.deepEqual(a.card('x.md'), { path: 'x.md', collapsed: true, color: 'green' });
		assert.ok(same(a.replica, b.replica));
	});

	it('keeps a card removed when the other device only folded or colored it', () => {
		const [a, b] = sharedDesk('x.md', 'y.md');
		b.fold('x.md', true);
		b.color('x.md', 'red');
		a.remove('x.md');
		exchange(a, b);
		assert.deepEqual(a.keys, ['y.md']);
		assert.deepEqual(b.keys, ['y.md']);
	});

	it('brings a removed card back when the other device puts it on the desk again', () => {
		const [a, b] = sharedDesk('x.md', 'y.md');
		a.fold('x.md', true);
		b.remove('x.md');
		a.add('x.md');
		exchange(a, b);
		assert.deepEqual(b.keys, ['x.md', 'y.md']);
		assert.equal(b.card('x.md')?.collapsed, false);
	});

	it('makes one card when both put the same note on the desk', () => {
		const [a, b] = sharedDesk('x.md');
		a.add('n.md');
		b.add('n.md', 1);
		exchange(a, b);
		assert.equal(a.keys.filter((key) => key === 'n.md').length, 1);
		assert.deepEqual(a.keys, b.keys);
	});

	it('keeps a reorder when the other device adds on top or removes', () => {
		const [a, b] = sharedDesk('x.md', 'y.md', 'z.md');
		a.move('z.md', 0);
		b.add('n.md');
		b.remove('y.md');
		exchange(a, b);
		assert.deepEqual(a.keys, ['n.md', 'z.md', 'x.md']);
		assert.deepEqual(b.keys, a.keys);
	});

	it('lets one order win when both reorder, losing no card', () => {
		const [a, b] = sharedDesk('x.md', 'y.md', 'z.md');
		a.move('z.md', 0);
		b.move('x.md', 2);
		exchange(a, b);
		assert.deepEqual(a.keys, ['y.md', 'z.md', 'x.md']);
		assert.deepEqual(b.keys, a.keys);
	});

	it('keeps a card the other device added while one cleared the desk', () => {
		const [a, b] = sharedDesk('x.md', 'y.md');
		a.clear();
		b.add('n.md');
		exchange(a, b);
		assert.deepEqual(a.keys, ['n.md']);
	});

	it('unites notes both added from the inbox', () => {
		const [a, b] = sharedDesk('x.md');
		a.change((desk) => desk.entries.unshift({ path: 'i1.md', collapsed: true }, { path: 'i2.md', collapsed: true }));
		b.change((desk) => desk.entries.unshift({ path: 'i2.md', collapsed: true }, { path: 'i3.md', collapsed: true }));
		exchange(a, b);
		assert.deepEqual([...a.keys].sort(), ['i1.md', 'i2.md', 'i3.md', 'x.md']);
		assert.deepEqual(a.keys, b.keys);
	});

	it('sorts a card colored on one device into its block while the other grouped', () => {
		const [a, b] = sharedDesk('x.md', 'y.md', 'z.md');
		a.color('x.md', 'red');
		b.receive(a);
		a.group(true);
		b.color('z.md', 'red');
		exchange(a, b);
		assert.equal(a.desk.grouped, true);
		assert.deepEqual(a.keys.slice(0, 2).sort(), ['x.md', 'z.md']);
		assert.deepEqual(b.keys, a.keys);
	});

	it('keeps grouping on a desk whose colors another device removed', () => {
		const [a, b] = sharedDesk('x.md', 'y.md');
		a.color('x.md', 'red');
		b.receive(a);
		a.group(true);
		b.color('x.md', undefined);
		exchange(a, b);
		// The store ends grouping on its next local change; materializing must not fail meanwhile.
		assert.equal(a.desk.grouped, true);
		assert.deepEqual(a.keys, ['x.md', 'y.md']);
	});

	it('resolves group names and settings register by register', () => {
		const [a, b] = sharedDesk('x.md');
		a.change((desk) => (desk.names.red = 'A'));
		b.change((desk) => {
			desk.names.blue = 'B';
			desk.prefs.cardMaxHeight = 70;
		});
		b.fold('x.md', true);
		exchange(a, b);
		assert.deepEqual(a.desk.names, { red: 'A', blue: 'B' });
		assert.equal(a.desk.prefs.cardMaxHeight, 70);
		assert.equal(a.card('x.md')?.collapsed, true);
	});
});

describe('renames and deletions', () => {
	it('moves a renamed note card with its fields and place', () => {
		const [a] = sharedDesk('x.md', 'old.md', 'y.md');
		a.color('old.md', 'cyan');
		a.move('y.md', 0);
		a.rename('old.md', 'new.md');
		assert.deepEqual(a.keys, ['y.md', 'x.md', 'new.md']);
		assert.equal(a.card('new.md')?.color, 'cyan');
	});

	it('moves headings and blocks of a renamed note along', () => {
		const [a] = sharedDesk('x.md');
		a.change((desk) => desk.entries.unshift({ path: 'old.md', subpath: '#Part', collapsed: false }));
		a.rename('old.md', 'new.md');
		assert.deepEqual(a.keys, ['new.md#Part', 'x.md']);
	});

	it('gives the same result when every device replays the rename', () => {
		const [a, b] = sharedDesk('old.md', 'y.md');
		a.rename('old.md', 'new.md');
		b.rename('old.md', 'new.md');
		exchange(a, b);
		assert.deepEqual(a.keys, ['new.md', 'y.md']);
		assert.ok(same(a.replica, b.replica));
	});

	it('loses an edit to the old card made while the other device renamed', () => {
		const [a, b] = sharedDesk('old.md');
		a.rename('old.md', 'new.md');
		b.color('old.md', 'red');
		exchange(a, b);
		assert.deepEqual(a.keys, ['new.md']);
		assert.equal(a.card('new.md')?.color, undefined);
	});

	it('does not let a replayed rename override a later change', () => {
		const [a, b] = sharedDesk('old.md');
		a.rename('old.md', 'new.md');
		a.color('new.md', 'purple');
		// b still has the old desk and replays the rename only now.
		b.rename('old.md', 'new.md');
		exchange(a, b);
		assert.equal(b.card('new.md')?.color, 'purple');
	});

	it('keeps both cards when an old name is taken again, whatever order a device replays it in', () => {
		const [a, b] = sharedDesk('Untitled.md');
		a.rename('Untitled.md', 'Title1.md');
		a.add('Untitled.md');
		// b got the desk first: its rename finds Title1 on the desk and stays out of it.
		const early = new Device('cccc', new World());
		early.receive(b, a);
		early.rename('Untitled.md', 'Title1.md');
		exchange(early, a);
		assert.deepEqual([...early.keys].sort(), ['Title1.md', 'Untitled.md']);
		// b replays the rename before the desk arrives.
		b.rename('Untitled.md', 'Title1.md');
		exchange(a, b);
		assert.deepEqual([...b.keys].sort(), ['Title1.md', 'Untitled.md']);
		assert.deepEqual(a.keys, b.keys);
	});

	it('keeps a card renamed onto a name whose card was removed long ago', () => {
		const [a] = sharedDesk('Final.md', 'Draft.md');
		a.remove('Final.md');
		a.rename('Draft.md', 'Final.md');
		assert.deepEqual(a.keys, ['Final.md']);
	});

	it('skips a rename onto a name that still has a card', () => {
		const [a] = sharedDesk('Final.md', 'Draft.md');
		a.rename('Draft.md', 'Final.md');
		assert.deepEqual(a.keys, ['Final.md', 'Draft.md']);
	});

	it('writes equivalent tombstones when every device sees a note deleted', () => {
		const [a, b] = sharedDesk('x.md', 'y.md');
		a.deleteNote('x.md');
		b.deleteNote('x.md');
		exchange(a, b);
		assert.deepEqual(a.keys, ['y.md']);
		assert.ok(same(a.replica, b.replica));
	});

	it('does not let a replayed deletion remove a card added again afterwards', () => {
		const [a, b] = sharedDesk('x.md');
		a.deleteNote('x.md');
		a.add('x.md');
		b.deleteNote('x.md');
		exchange(a, b);
		assert.deepEqual(b.keys, ['x.md']);
	});
});

describe('merging', () => {
	function randomReplicas(seed: number): Replica[] {
		const random = seededRandom(seed);
		const world = new World();
		const all = ['aaaa', 'bbbb', 'cccc'].map((id) => new Device(id, world));
		const paths = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'];
		const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
		for (let step = 0; step < 40; step++) {
			const device = pick(all);
			const path = pick(paths);
			const roll = random();
			if (roll < 0.25) device.add(path, Math.floor(random() * 3));
			else if (roll < 0.4) device.remove(path);
			else if (roll < 0.55) device.move(path, Math.floor(random() * 4));
			else if (roll < 0.65) device.fold(path, random() < 0.5);
			else if (roll < 0.75) device.color(path, pick(['red', 'blue', undefined] as const));
			else if (roll < 0.8) device.group(random() < 0.5);
			else if (roll < 0.85) device.rename(path, pick(paths));
			else if (roll < 0.9) device.deleteNote(path);
			else device.receive(pick(all));
		}
		return all.map((device) => device.replica);
	}

	it('is commutative, associative and idempotent', () => {
		for (let seed = 1; seed <= 300; seed++) {
			const [a, b, c] = randomReplicas(seed) as [Replica, Replica, Replica];
			assert.ok(same(merge(a, b), merge(b, a)), `commutative, seed ${seed}`);
			assert.ok(same(merge(merge(a, b), c), merge(a, merge(b, c))), `associative, seed ${seed}`);
			assert.ok(same(merge(a, a), merge(a, emptyReplica())), `idempotent, seed ${seed}`);
		}
	});

	it('tells whether one replica already holds another', () => {
		const [a, b] = sharedDesk('x.md');
		assert.ok(contains(a.replica, b.replica));
		b.fold('x.md', true);
		assert.ok(!contains(a.replica, b.replica));
		assert.ok(contains(b.replica, a.replica));
	});
});

describe('storing', () => {
	it('names a key after the device and a generation unique to the write', () => {
		const first = replicaKey('k3x9q2m1', formatStamp({ wall: 5000, counter: 0, device: 'k3x9q2m1' }));
		const second = replicaKey('k3x9q2m1', formatStamp({ wall: 5000, counter: 1, device: 'k3x9q2m1' }));
		assert.notEqual(first, second);
		assert.equal(deviceOfKey(first), 'k3x9q2m1');
		assert.equal(deviceOfKey('entries'), null);
	});

	it('reads back what it wrote', () => {
		const [a] = sharedDesk('x.md', 'y.md');
		a.change((desk) => {
			desk.names.none = 'Loose';
			desk.entries.unshift({ path: 'n.md', subpath: '#^block', collapsed: true, color: 'pink' });
		});
		a.remove('y.md');
		const json = JSON.parse(JSON.stringify(serializeReplica(a.replica))) as unknown;
		const parsed = parseReplica(json);
		assert.ok(parsed && parsed !== 'newer');
		assert.equal(parsed.damaged, false);
		assert.ok(same(parsed.replica, a.replica));
	});

	it('skips damaged parts and keeps the rest', () => {
		const [a] = sharedDesk('x.md', 'y.md');
		const json = JSON.parse(JSON.stringify(serializeReplica(a.replica))) as {
			cards: Record<string, Record<string, unknown>>;
			order: unknown;
		};
		const y = json.cards['y.md']!;
		json.cards['x.md']!.present = 'not a stamp';
		json.cards['wrong-key.md'] = y;
		// An own `__proto__` key, as JSON.parse makes one; plain assignment would set the prototype.
		Object.defineProperty(json.cards, '__proto__', {
			value: { path: '__proto__', present: y.present },
			enumerable: true,
			configurable: true,
			writable: true,
		});
		assert.ok(Object.keys(json.cards).includes('__proto__'));
		json.order = ['y.md'];
		const parsed = parseReplica(json);
		assert.ok(parsed && parsed !== 'newer');
		assert.equal(parsed.damaged, true);
		assert.deepEqual(Object.keys(parsed.replica.cards), ['y.md']);
		assert.equal(Object.getPrototypeOf(parsed.replica.cards), Object.prototype);
	});

	it('leaves a replica of a newer format unread', () => {
		assert.equal(parseReplica({ format: 99, cards: {} }), 'newer');
		const read = readReplicas({ 'replica:aaaa@x': { format: 99 }, entries: [] });
		assert.equal(read.newerFormat, true);
		assert.equal(read.replicas.size, 0);
	});

	it('reads only replica keys and ignores the old settings', () => {
		const [a] = sharedDesk('x.md');
		const data = { entries: [{ path: 'legacy.md' }], 'replica:aaaa@1': serializeReplica(a.replica) };
		const read = readReplicas(JSON.parse(JSON.stringify(data)));
		assert.deepEqual([...read.replicas.keys()], ['replica:aaaa@1']);
	});

	it('migrates a desk with stamps every real change outranks', () => {
		const [b] = devices('bbbb') as [Device];
		b.add('x.md');
		b.color('x.md', 'red');
		const legacy = fromDeskState(
			{
				entries: [
					{ path: 'x.md', collapsed: true, color: 'blue' },
					{ path: 'local.md', collapsed: false },
				],
				grouped: false,
				names: {},
				prefs: DEFAULT_PREFS,
			},
			'aaaa',
		);
		assert.equal(legacy.cards['x.md']?.present, minimalStamp('aaaa'));
		const desk = materialize(merge(legacy, b.replica), DEFAULT_PREFS);
		assert.deepEqual(
			desk.entries.map((entry) => [entry.path, entry.color]),
			[
				['x.md', 'red'],
				['local.md', undefined],
			],
		);
	});

	it('compares desks by what the pane shows', () => {
		const [a] = sharedDesk('x.md', 'y.md');
		const desk = a.desk;
		const copy = { ...desk, entries: desk.entries.map((entry) => ({ ...entry, previewHeight: 120 })) };
		assert.ok(sameDeskState(desk, copy));
		copy.entries[0]!.collapsed = !copy.entries[0]!.collapsed;
		assert.ok(!sameDeskState(desk, copy));
	});
});

describe('cleaning up', () => {
	it('drops tombstones past the horizon and keeps recent ones', () => {
		const [a] = sharedDesk('x.md', 'y.md');
		a.remove('x.md');
		const stamp = a.replica.gone['x.md']!;
		const now = Date.UTC(2026, 10, 24, 12);
		assert.ok(collectGarbage(a.replica, now).gone['x.md']);
		assert.equal(collectGarbage(a.replica, now + TOMBSTONE_HORIZON_MS + 60_000).gone['x.md'], undefined);
		assert.ok(stamp);
	});

	it('lets a device back after the horizon drop the cards others forgot, but not its offline work', () => {
		const world = new World();
		const a = new Device('aaaa', world);
		const b = new Device('bbbb', world);
		a.add('x.md');
		a.add('y.md');
		// Each device's own list records when it last saw the other.
		a.replica.devices.bbbb = { seen: formatStamp({ wall: world.now, counter: 0, device: 'bbbb' }) };
		b.receive(a);
		// a goes away; b removes x, and the tombstone is collected long after.
		b.remove('x.md');
		world.advance(TOMBSTONE_HORIZON_MS + 86_400_000);
		b.replica = collectGarbage(b.replica, world.now);
		// a worked offline on a new card before coming back.
		a.add('offline.md');
		const own = applyReturnerRule(a.replica, b.replica, 'aaaa', world.now);
		const merged = materialize(merge(own, b.replica), DEFAULT_PREFS);
		assert.deepEqual(merged.entries.map((entry) => entry.path).sort(), ['offline.md', 'y.md']);
	});

	it('leaves a device that was in touch recently alone', () => {
		const world = new World();
		const a = new Device('aaaa', world);
		a.add('x.md');
		a.replica.devices.bbbb = { seen: formatStamp({ wall: world.now, counter: 0, device: 'bbbb' }) };
		const others = new Device('bbbb', world);
		others.add('y.md');
		assert.equal(applyReturnerRule(a.replica, others.replica, 'aaaa', world.now + 1000), a.replica);
	});
});
