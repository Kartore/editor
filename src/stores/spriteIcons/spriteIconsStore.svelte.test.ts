import { describe, expect, it, vi } from 'vitest';

import type { SpriteIcons, SpriteIconsStoreAdapter } from './SpriteIconsStoreAdapter.ts';
import { SpriteIconsStore } from './spriteIconsStore.svelte.ts';

const createAdapter = (initial: SpriteIcons | null = null) => {
	const save = vi.fn<SpriteIconsStoreAdapter['save']>(async () => undefined);
	return {
		adapter: {
			id: 'test',
			load: async () => initial,
			save
		} satisfies SpriteIconsStoreAdapter,
		save
	};
};

describe('SpriteIconsStore', () => {
	it('loads saved icons', async () => {
		const { adapter } = createAdapter({ marker: { svg: '<svg />' } });
		const store = new SpriteIconsStore({ adapter });

		expect(store.isLoading).toBe(true);
		await vi.waitFor(() => expect(store.isLoading).toBe(false));
		expect(store.icons).toEqual({ marker: { svg: '<svg />' } });
	});

	it('saves immediately when icons are added and removed', async () => {
		const { adapter, save } = createAdapter();
		const store = new SpriteIconsStore({ adapter });
		await vi.waitFor(() => expect(store.isLoading).toBe(false));

		store.setIcon('marker', { svg: '<svg width="12" height="12" />' });
		expect(store.icons).toEqual({ marker: { svg: '<svg width="12" height="12" />' } });
		expect(save).toHaveBeenLastCalledWith({ marker: { svg: '<svg width="12" height="12" />' } });

		store.removeIcon('marker');
		expect(store.icons).toEqual({});
		expect(save).toHaveBeenLastCalledWith({});
	});

	it('stores the canonical form of the sdf flag', async () => {
		const { adapter, save } = createAdapter();
		const store = new SpriteIconsStore({ adapter });
		await vi.waitFor(() => expect(store.isLoading).toBe(false));

		store.setIcon('pin', { svg: '<svg />', sdf: true });
		expect(save).toHaveBeenLastCalledWith({ pin: { svg: '<svg />', sdf: true } });

		// false はキーごと省く
		store.setIcon('pin', { svg: '<svg />', sdf: false } as unknown as { svg: string });
		expect(store.icons).toEqual({ pin: { svg: '<svg />' } });
		expect(Object.hasOwn(store.icons.pin, 'sdf')).toBe(false);
	});

	it('saves plain objects that structured cloning accepts', async () => {
		const { adapter, save } = createAdapter({ marker: { svg: '<svg />' } });
		const store = new SpriteIconsStore({ adapter });
		await vi.waitFor(() => expect(store.isLoading).toBe(false));

		store.setIcon('pin', { svg: '<svg />', sdf: true });
		// IndexedDB の put は構造化複製する。$state のプロキシが混ざると DataCloneError になる
		expect(() => structuredClone(save.mock.lastCall?.[0])).not.toThrow();
		expect(() => structuredClone(store.icons)).not.toThrow();
	});

	it('replaces and persists the complete icon collection', async () => {
		const { adapter, save } = createAdapter({ old: { svg: '<svg id="old" />' } });
		const store = new SpriteIconsStore({ adapter });
		await vi.waitFor(() => expect(store.isLoading).toBe(false));

		await store.replaceIcons({ marker: { svg: '<svg id="marker" />', sdf: true } });

		expect(save).toHaveBeenCalledWith({ marker: { svg: '<svg id="marker" />', sdf: true } });
		expect(store.icons).toEqual({ marker: { svg: '<svg id="marker" />', sdf: true } });
	});

	it('accepts the legacy string format from adapters', async () => {
		const { adapter, save } = createAdapter();
		const store = new SpriteIconsStore({ adapter });
		await vi.waitFor(() => expect(store.isLoading).toBe(false));

		await store.replaceIcons({ marker: '<svg />' } as unknown as SpriteIcons);

		expect(save).toHaveBeenCalledWith({ marker: { svg: '<svg />' } });
		expect(store.icons).toEqual({ marker: { svg: '<svg />' } });
		await expect(store.replaceIcons({ marker: 1 } as unknown as SpriteIcons)).rejects.toThrow(
			'Invalid sprite icons.'
		);
	});

	it('keeps the current collection when replacement persistence fails', async () => {
		const { adapter } = createAdapter({ old: { svg: '<svg id="old" />' } });
		adapter.save = vi.fn(async () => {
			throw new Error('quota exceeded');
		});
		const store = new SpriteIconsStore({ adapter });
		await vi.waitFor(() => expect(store.isLoading).toBe(false));

		await expect(store.replaceIcons({ marker: { svg: '<svg />' } })).rejects.toThrow(
			'quota exceeded'
		);

		expect(store.icons).toEqual({ old: { svg: '<svg id="old" />' } });
		expect(store.saveError?.message).toBe('quota exceeded');
	});
});
