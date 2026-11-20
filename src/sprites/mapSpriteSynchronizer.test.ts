import type { Map as MaplibreMap } from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./spritore.ts', () => ({
	loadSpritore: async () => ({
		renderIcon: async (
			id: string,
			_svg: string,
			pixelRatio: number,
			options: { sdf?: boolean } = {}
		) => {
			// spritore と同じく SDF は 3 論理 px の余白が付く
			const size = (10 + (options.sdf ? 6 : 0)) * pixelRatio;
			return {
				id,
				width: size,
				height: size,
				pixels: new Uint8Array(size * size * 4),
				sdf: options.sdf === true
			};
		}
	})
}));

const { MapSpriteSynchronizer } = await import('./mapSpriteSynchronizer.ts');

/** MapLibre の画像管理と styledata イベントだけを真似た地図 */
const createFakeMap = () => {
	const images = new Map<string, { source: 'local' | 'sheet' }>();
	const listeners = new Set<() => void>();
	const map = {
		images,
		// MapLibre と同じく、追加の中で同期的に styledata を出す
		// 引数 (画像と options) は mock.calls で検証する
		addImage: vi.fn<
			(id: string, image: unknown, options?: { pixelRatio?: number; sdf?: boolean }) => void
		>((id) => {
			if (images.has(id)) throw new Error(`An image named "${id}" already exists.`);
			images.set(id, { source: 'local' });
			for (const listener of listeners) listener();
		}),
		removeImage: (id: string) => images.delete(id),
		hasImage: (id: string) => images.has(id),
		getImage: (id: string) => images.get(id),
		setMissingStyleImageResolver: vi.fn(),
		on: (_type: string, listener: () => void) => listeners.add(listener),
		off: (_type: string, listener: () => void) => listeners.delete(listener),
		/** スプライトシートの読み込み: 同じ id の画像を置き換えて styledata を出す */
		loadSheet(ids: string[]) {
			for (const id of ids) images.set(id, { source: 'sheet' });
			for (const listener of listeners) listener();
		},
		listenerCount: () => listeners.size
	};
	return map;
};

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';

describe('MapSpriteSynchronizer', () => {
	it('keeps local icons over sprite sheet images with the same id', async () => {
		const map = createFakeMap();
		const synchronizer = new MapSpriteSynchronizer(() => {});
		synchronizer.input = { map: map as unknown as MaplibreMap, icons: { arrow: { svg } } };
		await vi.waitFor(() => expect(map.images.get('arrow')?.source).toBe('local'));

		// シートが後から読み込まれて上書きしても、ローカルを入れ直す
		map.addImage.mockClear();
		map.loadSheet(['arrow', 'park']);
		expect(map.images.get('arrow')?.source).toBe('local');
		// 入れ直しの中の styledata で二重に入れ直さない (MapLibre なら "already exists" になる)
		expect(map.addImage).toHaveBeenCalledTimes(1);
		expect(map.images.get('park')?.source).toBe('sheet');

		// 入れ直した後の styledata では何もしない (ループしない)
		const calls = map.addImage.mock.calls.length;
		map.loadSheet([]);
		expect(map.addImage.mock.calls.length).toBe(calls);
	});

	it('re-adds the image with the sdf option when only sdf changes', async () => {
		const map = createFakeMap();
		const synchronizer = new MapSpriteSynchronizer(() => {});
		synchronizer.input = { map: map as unknown as MaplibreMap, icons: { arrow: { svg } } };
		await vi.waitFor(() => expect(map.addImage).toHaveBeenCalledTimes(1));
		expect(map.addImage.mock.calls[0][2]).toEqual({ pixelRatio: 2, sdf: false });

		synchronizer.input = {
			map: map as unknown as MaplibreMap,
			icons: { arrow: { svg, sdf: true } }
		};
		await vi.waitFor(() => expect(map.addImage).toHaveBeenCalledTimes(2));
		expect(map.addImage.mock.calls[1][1]).toMatchObject({ width: 32, height: 32 });
		expect(map.addImage.mock.calls[1][2]).toEqual({ pixelRatio: 2, sdf: true });

		synchronizer.input = { map: map as unknown as MaplibreMap, icons: { arrow: { svg } } };
		await vi.waitFor(() => expect(map.addImage).toHaveBeenCalledTimes(3));
		expect(map.addImage.mock.calls[2][2]).toEqual({ pixelRatio: 2, sdf: false });
	});

	it('reports SVG dimensions without the SDF padding', async () => {
		const map = createFakeMap();
		const onDimensions = vi.fn();
		const synchronizer = new MapSpriteSynchronizer(onDimensions);
		synchronizer.input = {
			map: map as unknown as MaplibreMap,
			icons: { arrow: { svg, sdf: true } }
		};
		await vi.waitFor(() => expect(onDimensions).toHaveBeenCalled());
		expect(onDimensions.mock.lastCall?.[0].arrow).toMatchObject({ width: 10, height: 10 });
	});

	it('stops listening when destroyed or when the map changes', async () => {
		const first = createFakeMap();
		const second = createFakeMap();
		const synchronizer = new MapSpriteSynchronizer(() => {});
		synchronizer.input = { map: first as unknown as MaplibreMap, icons: {} };
		expect(first.listenerCount()).toBe(1);
		synchronizer.input = { map: second as unknown as MaplibreMap, icons: {} };
		expect(first.listenerCount()).toBe(0);
		expect(second.listenerCount()).toBe(1);
		synchronizer.destroy();
		expect(second.listenerCount()).toBe(0);
	});
});
