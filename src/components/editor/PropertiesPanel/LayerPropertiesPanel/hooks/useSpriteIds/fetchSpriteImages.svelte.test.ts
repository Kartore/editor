import { describe, expect, it } from 'vitest';

import type { ResourceLoader } from '#src/editor/requestTransform.ts';

import { fetchSpriteImages } from './useSpriteIds.svelte.ts';

const entry = { x: 0, y: 0, width: 10, height: 10, pixelRatio: 1 };
const loader: ResourceLoader = {
	fetch: async (url) =>
		Response.json(url.includes('roads') ? { shield: entry } : { arrow: entry, park: entry }),
	imageUrl: async (url) => url
};

describe('fetchSpriteImages', () => {
	it('names images like MapLibre: unprefixed for a string sprite and the "default" sheet', async () => {
		const single = await fetchSpriteImages(loader, 'https://example.com/sprite?key=k');
		expect(single.map(({ id }) => id)).toEqual(['arrow', 'park']);
		expect(single[0].src).toBe('https://example.com/sprite.png?key=k');

		const multiple = await fetchSpriteImages(loader, [
			{ id: 'default', url: 'https://example.com/base' },
			{ id: 'roads', url: 'https://example.com/roads' }
		]);
		expect(multiple.map(({ id }) => id)).toEqual(['arrow', 'park', 'roads:shield']);
	});

	it('keeps the sdf flag of SDF entries only', async () => {
		const sdfLoader: ResourceLoader = {
			fetch: async () =>
				Response.json({
					pin: { ...entry, sdf: true },
					arrow: entry,
					odd: { ...entry, sdf: 'yes' }
				}),
			imageUrl: async (url) => url
		};
		const images = await fetchSpriteImages(sdfLoader, 'https://example.com/sprite');
		expect(Object.fromEntries(images.map(({ id, sdf }) => [id, sdf]))).toEqual({
			pin: true,
			arrow: undefined,
			odd: undefined
		});
		expect(
			Object.hasOwn(
				images.find(({ id }) => id === 'arrow')!,
				'sdf'
			)
		).toBe(false);
	});
});
