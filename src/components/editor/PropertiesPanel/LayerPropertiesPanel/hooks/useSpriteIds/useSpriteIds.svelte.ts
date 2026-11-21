import type { SpriteSpecification } from '@maplibre/maplibre-gl-style-spec';
import { createQuery } from '@tanstack/svelte-query';
import type { ResourceType } from 'maplibre-gl';

import { useResourceLoader } from '#src/contexts/requestTransform.ts';
import { spriteFileUrl } from '#src/sprites/spriteSvg.ts';
import type { ResourceLoader } from '#src/editor/requestTransform.ts';

import { mergeLocalSpriteImages, useLocalSpriteImages } from './localSpriteImages.ts';

export type SpriteImage = {
	id: string;
	src: string;
	x: number;
	y: number;
	width: number;
	height: number;
	pixelRatio: number;
	/** MapLibre の SDF アイコン (単色・icon-color で着色)。sprite.json の画像は距離場なのでそのまま描くとぼやける */
	sdf?: boolean;
};

type SpriteJSONEntry = {
	x?: unknown;
	y?: unknown;
	width?: unknown;
	height?: unknown;
	pixelRatio?: unknown;
	sdf?: unknown;
};

const toSpriteImage = (
	id: string,
	src: string,
	entry: SpriteJSONEntry
): SpriteImage | undefined => {
	if (
		typeof entry.x !== 'number' ||
		typeof entry.y !== 'number' ||
		typeof entry.width !== 'number' ||
		typeof entry.height !== 'number'
	) {
		return undefined;
	}
	return {
		id,
		src,
		x: entry.x,
		y: entry.y,
		width: entry.width,
		height: entry.height,
		pixelRatio: typeof entry.pixelRatio === 'number' && entry.pixelRatio > 0 ? entry.pixelRatio : 1,
		...(entry.sdf === true ? { sdf: true } : {})
	};
};

// ResourceType は const enum なので文字列値で渡す
const spriteJson = 'SpriteJSON' as ResourceType;
const spriteImage = 'SpriteImage' as ResourceType;

// sprite の URL はアダプタの書き換え (registerRequestTransformer) を通して取る (cloudmap:// 等の独自スキーム対策)
const fetchSpriteSheet = async (
	loader: ResourceLoader,
	url: string,
	idPrefix: string
): Promise<SpriteImage[]> => {
	const response = await loader.fetch(spriteFileUrl(url, '.json'), spriteJson);
	const data = (await response.json()) as Record<string, SpriteJSONEntry>;
	const src = await loader.imageUrl(spriteFileUrl(url, '.png'), spriteImage);
	return Object.entries(data)
		.map(([id, entry]) => toSpriteImage(`${idPrefix}${id}`, src, entry))
		.filter((entry): entry is SpriteImage => entry !== undefined);
};

export const fetchSpriteImages = async (
	loader: ResourceLoader,
	url: SpriteSpecification | undefined
): Promise<SpriteImage[]> => {
	if (!url) return [];
	if (typeof url === 'string') return fetchSpriteSheet(loader, url, '');
	if (Array.isArray(url)) {
		// MapLibre は id が "default" のシートを接頭辞なしで扱う (それ以外は `<id>:<名前>`)。地図上の名前と揃える
		const images = await Promise.all(
			url.map((sprite) =>
				fetchSpriteSheet(loader, sprite.url, sprite.id === 'default' ? '' : `${sprite.id}:`)
			)
		);
		return images.flat();
	}
	return [];
};

/**
 * スタイルの sprite (スプライトシート) の画像一覧を取る。キーが同じなのでアイコン候補・Sprites の列で取得を共有する。
 * コンポーネントの初期化中に呼ぶこと
 */
const createSpriteSheetQuery = (getSprite: () => SpriteSpecification | undefined) => {
	const loader = useResourceLoader();
	const spriteKey = $derived.by(() => {
		const sprite = getSprite();
		if (!sprite) return [];
		return typeof sprite === 'string'
			? [{ id: 'default', url: sprite }]
			: sprite.map(({ id, url }) => ({ id, url }));
	});
	return createQuery(() => ({
		queryKey: ['sprite', spriteKey],
		queryFn: () => {
			const sprite = getSprite();
			return fetchSpriteImages(
				loader,
				sprite == null ? undefined : ($state.snapshot(sprite as object) as SpriteSpecification)
			);
		}
	}));
};

/** スプライトシートの画像 id (ローカルのアイコンを含まない)。読み込み前は undefined */
export const createSpriteSheetImageIds = (getSprite: () => SpriteSpecification | undefined) => {
	const query = createSpriteSheetQuery(getSprite);
	return {
		get ids(): string[] | undefined {
			return query.data?.map((image) => image.id);
		}
	};
};

export const createSpriteIds = (getSprite: () => SpriteSpecification | undefined) => {
	const getLocalSpriteImages = useLocalSpriteImages();
	const query = createSpriteSheetQuery(getSprite);
	const spriteImages = $derived.by(() => {
		const localImages = getLocalSpriteImages();
		const fetchedImages = query.data;
		if (localImages.length === 0 && fetchedImages === undefined) return undefined;

		return mergeLocalSpriteImages(localImages, fetchedImages ?? []);
	});

	return {
		get spriteIds(): string[] | undefined {
			return spriteImages?.map((image) => image.id);
		},
		get spriteImages(): SpriteImage[] | undefined {
			return spriteImages;
		}
	};
};
