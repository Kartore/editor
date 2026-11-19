import { describe, expect, it } from 'vitest';

import { memoryKv } from './kv.ts';
import { createRuntimeBase, resolvePublicOrigin, stringEnv } from './runtime.ts';

describe('resolvePublicOrigin', () => {
	it('uses the request origin without PUBLIC_ORIGIN', () => {
		expect(resolvePublicOrigin(new Request('http://localhost:5173/api/x'), {})).toEqual({
			origin: 'http://localhost:5173',
			secure: false
		});
	});

	it('prefers PUBLIC_ORIGIN and strips the trailing slash', () => {
		expect(
			resolvePublicOrigin(new Request('http://127.0.0.1:3000/api/x'), {
				PUBLIC_ORIGIN: ' https://app.kartore.io/ '
			})
		).toEqual({ origin: 'https://app.kartore.io', secure: true });
	});
});

describe('stringEnv', () => {
	it('drops non-string bindings', () => {
		expect(stringEnv({ A: 'a', KV: { get() {} }, N: 1 })).toEqual({ A: 'a' });
	});
});

describe('runtime kv', () => {
	it('namespaces keys with the handler id and rounds the TTL up to 60 seconds', async () => {
		let now = 0;
		const raw = memoryKv(() => now);
		const runtime = createRuntimeBase({
			request: new Request('https://example.com/api/github/me'),
			env: {},
			kv: raw,
			waitUntil: () => {},
			platform: 'test',
			handlerId: 'github'
		});
		await runtime.kv.put('insttoken:1', JSON.stringify({ token: 't' }), { ttlSeconds: 5 });
		expect(await raw.get('github:insttoken:1')).toBe('{"token":"t"}');
		expect(await runtime.kv.getJson('insttoken:1')).toEqual({ token: 't' });
		now = 59_000;
		expect(await runtime.kv.get('insttoken:1')).not.toBeNull();
		now = 60_000;
		expect(await runtime.kv.get('insttoken:1')).toBeNull();
		await runtime.kv.put('k', 'v');
		await runtime.kv.delete('k');
		expect(await raw.get('github:k')).toBeNull();
	});
});
