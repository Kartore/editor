import { describe, expect, it } from 'vitest';

import { memoryKv, sqliteKv } from './kv.ts';

describe.each([
	['memoryKv', (now: () => number) => memoryKv(now)],
	['sqliteKv', (now: () => number) => sqliteKv(':memory:', now)]
])('%s', (_, create) => {
	it('stores, expires and deletes values', async () => {
		let now = 1_000;
		const kv = create(() => now);
		expect(await kv.get('missing')).toBeNull();
		await kv.put('a', 'one');
		await kv.put('b', '{"x":1}', { ttlSeconds: 60 });
		expect(await kv.get('a')).toBe('one');
		expect(await kv.getJson('b')).toEqual({ x: 1 });
		await kv.put('a', 'two');
		expect(await kv.get('a')).toBe('two');
		now += 60_000;
		expect(await kv.get('b')).toBeNull();
		expect(await kv.get('a')).toBe('two');
		await kv.delete('a');
		expect(await kv.get('a')).toBeNull();
	});
});
