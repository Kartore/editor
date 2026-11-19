import type { ResourceType } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';

import { GLYPH_PROTOCOL_TEMPLATE } from '../fonts/glyphProtocol.ts';

import { createRequestTransformerRegistry } from './requestTransform.ts';

const glyphs = 'Glyphs' as ResourceType;

describe('createRequestTransformerRegistry', () => {
	it('does not rewrite without transformers', () => {
		const registry = createRequestTransformerRegistry();
		expect(registry.transform('https://example.com/a', glyphs)).toBeUndefined();
	});

	it('uses the first transformer that rewrites, in registration order', () => {
		const registry = createRequestTransformerRegistry();
		const seen: string[] = [];
		registry.register((url) => {
			seen.push('skip');
			return url.startsWith('other://') ? { url: 'https://other' } : undefined;
		});
		registry.register((url) => {
			seen.push('first');
			return url.startsWith('cloudmap://')
				? { url: url.replace('cloudmap://', 'https://cdn/') }
				: undefined;
		});
		registry.register(() => {
			seen.push('second');
			return { url: 'https://never' };
		});
		expect(registry.transform('cloudmap://sprites/a', glyphs)).toEqual({
			url: 'https://cdn/sprites/a'
		});
		expect(seen).toEqual(['skip', 'first']);
	});

	it('re-evaluates on every call so a transformer can pick up a key later', () => {
		const registry = createRequestTransformerRegistry();
		let key: string | null = null;
		registry.register((url) => (key ? { url: `${url}?key=${key}` } : undefined));
		expect(registry.transform('https://tiles/1', glyphs)).toBeUndefined();
		key = 'k1';
		expect(registry.transform('https://tiles/1', glyphs)).toEqual({
			url: 'https://tiles/1?key=k1'
		});
	});

	it('continues after an async transformer that resolves to undefined', async () => {
		const registry = createRequestTransformerRegistry();
		registry.register(async () => undefined);
		registry.register((url) => ({ url: `${url}#2`, headers: { a: 'b' } }));
		await expect(registry.transform('https://x', glyphs)).resolves.toEqual({
			url: 'https://x#2',
			headers: { a: 'b' }
		});
		const onlyAsync = createRequestTransformerRegistry();
		onlyAsync.register(async () => undefined);
		await expect(onlyAsync.transform('https://y', glyphs)).resolves.toEqual({ url: 'https://y' });
	});

	it('never shows the editor glyph protocol to transformers, and can unregister', async () => {
		const registry = createRequestTransformerRegistry();
		const unregister = registry.register((url) => ({ url: `${url}!` }));
		expect(registry.transform(GLYPH_PROTOCOL_TEMPLATE, glyphs)).toBeUndefined();
		await expect(registry.resolve('https://z', glyphs)).resolves.toEqual({ url: 'https://z!' });
		unregister();
		await expect(registry.resolve('https://z', glyphs)).resolves.toEqual({ url: 'https://z' });
	});
});

describe('createResourceLoader', () => {
	it('fetches through the transformer and makes blob URLs only when needed', async () => {
		const registry = createRequestTransformerRegistry();
		registry.register((url) =>
			url.startsWith('cloudmap://')
				? { url: url.replace('cloudmap://', 'https://cdn/'), headers: { authorization: 'k' } }
				: undefined
		);
		const { createResourceLoader } = await import('./requestTransform.ts');
		const calls: [string, RequestInit | undefined][] = [];
		const loader = createResourceLoader(registry, async (input, init) => {
			calls.push([String(input), init]);
			return new Response('png');
		});
		await loader.fetch('cloudmap://sprites/a.json', 'SpriteJSON' as ResourceType);
		expect(calls[0][0]).toBe('https://cdn/sprites/a.json');
		expect(calls[0][1]?.headers).toEqual({ authorization: 'k' });

		expect(await loader.imageUrl('https://plain/a.png', 'SpriteImage' as ResourceType)).toBe(
			'https://plain/a.png'
		);
		expect(calls).toHaveLength(1);
		expect(
			await loader.imageUrl('cloudmap://sprites/a.png', 'SpriteImage' as ResourceType)
		).toMatch(/^blob:/);
		expect(calls).toHaveLength(2);
	});
});
