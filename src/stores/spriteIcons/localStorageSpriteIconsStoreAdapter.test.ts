import { afterEach, describe, expect, it, vi } from 'vitest';

import { localStorageSpriteIconsStoreAdapter } from './localStorageSpriteIconsStoreAdapter.ts';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('localStorageSpriteIconsStoreAdapter', () => {
	it('uses the sprite SVG storage key for load and save', async () => {
		const getItem = vi.fn(() => JSON.stringify({ marker: { svg: '<svg />', sdf: true } }));
		const setItem = vi.fn();
		vi.stubGlobal('localStorage', { getItem, setItem });

		await expect(localStorageSpriteIconsStoreAdapter.load()).resolves.toEqual({
			marker: { svg: '<svg />', sdf: true }
		});
		expect(getItem).toHaveBeenCalledWith('kartore:sprite-svgs');

		await localStorageSpriteIconsStoreAdapter.save({ marker: { svg: '<svg />' } });
		expect(setItem).toHaveBeenCalledWith(
			'kartore:sprite-svgs',
			JSON.stringify({ marker: { svg: '<svg />' } })
		);
	});

	it('reads the legacy format where each value is the SVG text', async () => {
		vi.stubGlobal('localStorage', {
			getItem: () => JSON.stringify({ marker: '<svg />' }),
			setItem: vi.fn()
		});

		await expect(localStorageSpriteIconsStoreAdapter.load()).resolves.toEqual({
			marker: { svg: '<svg />' }
		});
	});

	it('ignores malformed or non-string records', async () => {
		const getItem = vi
			.fn()
			.mockReturnValueOnce('{')
			.mockReturnValueOnce(JSON.stringify({ marker: 42 }))
			.mockReturnValueOnce(JSON.stringify({ marker: { sdf: true } }));
		vi.stubGlobal('localStorage', { getItem, setItem: vi.fn() });

		await expect(localStorageSpriteIconsStoreAdapter.load()).resolves.toBeNull();
		await expect(localStorageSpriteIconsStoreAdapter.load()).resolves.toBeNull();
		await expect(localStorageSpriteIconsStoreAdapter.load()).resolves.toBeNull();
	});
});
