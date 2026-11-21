import type { Map as MaplibreMap, StyleImageMetadata } from 'maplibre-gl';
import type { RenderedIcon } from '@kartore/spritore';

import type { SpriteIcon, SpriteIcons } from '#src/stores/spriteIcons';
import { spriteIconRenderOptions } from '#src/stores/spriteIcons/spriteIconsFormat.ts';

import { loadSpritore } from './spritore.ts';
import { spriteDimensionsFromSvg } from './spriteSvg.ts';

export type LocalSpriteDimensions = {
	svg: string;
	width: number;
	height: number;
};

type RenderedLocalSprite = RenderedIcon & {
	/** 描画に使ったアイコンの識別キー (iconKey) */
	key: string;
};

export type MapSpriteSyncInput = {
	map: MaplibreMap | null;
	icons: SpriteIcons;
};

/** SVG と設定 (SDF・9-slice) の組。どれかが変われば描き直して地図の画像を入れ直す */
const iconKey = (icon: SpriteIcon): string =>
	`${JSON.stringify(spriteIconRenderOptions(icon))}:${icon.svg}`;

export class MapSpriteSynchronizer {
	#generation = 0;
	#map: MaplibreMap | null = null;
	#icons: SpriteIcons = {};
	// 地図に入れたアイコンの iconKey
	#synchronizedIconKeys = new Map<string, string>();
	#renderedLocalSprites = new Map<string, RenderedLocalSprite>();
	// 地図に入れたローカルアイコンの画像 (map.getImage の戻り値)。スプライトシートに置き換えられたかを見分けるのに使う
	#addedImages = new Map<string, unknown>();
	// addImage は中で同期的に styledata を出すので、入れ直しの途中で呼ばれた styledata は無視する
	#reapplying = false;
	#onDimensions: (dimensions: Record<string, LocalSpriteDimensions>) => void;

	constructor(onDimensions: (dimensions: Record<string, LocalSpriteDimensions>) => void) {
		this.#onDimensions = onDimensions;
	}

	set input({ map, icons }: MapSpriteSyncInput) {
		this.#icons = icons;
		const entries = Object.entries(icons);
		const iconKeys = new Map(entries.map(([id, icon]) => [id, iconKey(icon)]));
		const generation = ++this.#generation;

		if (map !== this.#map) {
			this.#map?.setMissingStyleImageResolver(null);
			this.#map?.off('styledata', this.#reapplyLocalSprites);
			this.#map = map;
			this.#synchronizedIconKeys = new Map();
			this.#addedImages = new Map();
			map?.setMissingStyleImageResolver(this.#resolveMissingStyleImage);
			map?.on('styledata', this.#reapplyLocalSprites);
		}

		if (map) {
			for (const [id, key] of this.#synchronizedIconKeys) {
				if (iconKeys.get(id) === key) continue;
				this.#removeLocalSprite(map, id);
				this.#synchronizedIconKeys.delete(id);
				this.#addedImages.delete(id);
			}
		}

		if (entries.length === 0) {
			this.#renderedLocalSprites = new Map();
			this.#onDimensions({});
			return;
		}

		void this.#synchronize(generation, map, entries);
	}

	destroy = () => {
		this.#generation += 1;
		this.#map?.setMissingStyleImageResolver(null);
		this.#map?.off('styledata', this.#reapplyLocalSprites);
		this.#map = null;
	};

	#removeLocalSprite(map: MaplibreMap, id: string) {
		if (map.hasImage(id)) map.removeImage(id);
	}

	#addLocalSprite(map: MaplibreMap, sprite: RenderedLocalSprite) {
		this.#removeLocalSprite(map, sprite.id);
		map.addImage(
			sprite.id,
			{ width: sprite.width, height: sprite.height, data: sprite.pixels },
			// SDF の画素は RGB が 0 でアルファだけが距離。フラグと画素の組を必ず揃える。
			// 9-slice のメタデータは spritore が画像ピクセルに直したものをそのまま渡す
			{
				pixelRatio: 2,
				sdf: sprite.sdf,
				...(sprite.stretchX ? { stretchX: sprite.stretchX.map(([a, b]) => [a, b]) } : {}),
				...(sprite.stretchY ? { stretchY: sprite.stretchY.map(([a, b]) => [a, b]) } : {}),
				...(sprite.content ? { content: [...sprite.content] } : {}),
				...(sprite.textFitWidth ? { textFitWidth: sprite.textFitWidth } : {}),
				...(sprite.textFitHeight ? { textFitHeight: sprite.textFitHeight } : {})
			} as Partial<StyleImageMetadata>
		);
		this.#addedImages.set(sprite.id, map.getImage(sprite.id));
	}

	/**
	 * スタイルの sprite (スプライトシート) が読み込まれると、同じ id のローカルアイコンが上書きされる
	 * (ページの読み直しや sprite の URL の変更でシートが後から読み込まれたとき)。
	 * 編集中のローカルアイコンを優先するため、置き換えられていたら入れ直す
	 */
	#reapplyLocalSprites = () => {
		const map = this.#map;
		if (!map || this.#reapplying) return;
		this.#reapplying = true;
		try {
			for (const [id, key] of this.#synchronizedIconKeys) {
				const sprite = this.#renderedLocalSprites.get(id);
				const icon = this.#icons[id];
				if (!sprite || sprite.key !== key || !icon || iconKey(icon) !== key) continue;
				const current = map.getImage(id);
				if (current !== undefined && current === this.#addedImages.get(id)) continue;
				try {
					this.#addLocalSprite(map, sprite);
				} catch {
					// 次の styledata で再試行する
				}
			}
		} finally {
			this.#reapplying = false;
		}
	};

	async #synchronize(generation: number, map: MaplibreMap | null, entries: [string, SpriteIcon][]) {
		try {
			const { renderIcon } = await loadSpritore();
			const nextRenderedSprites = new Map<string, RenderedLocalSprite>();
			const nextDimensions: Record<string, LocalSpriteDimensions> = {};

			for (const [id, icon] of entries) {
				const { svg } = icon;
				const key = iconKey(icon);
				const svgDimensions = spriteDimensionsFromSvg(svg);
				nextDimensions[id] = {
					svg,
					width: svgDimensions.width,
					height: svgDimensions.height
				};
				try {
					const cached = this.#renderedLocalSprites.get(id);
					const rendered =
						cached?.key === key
							? cached
							: { ...(await renderIcon(id, svg, 2, spriteIconRenderOptions(icon))), key };
					nextRenderedSprites.set(id, rendered);

					// 寸法は SVG の論理サイズ (SDF の余白を含めない) なので sdf 無しで測る
					if (!svgDimensions.hasIntegerSizeAttributes) {
						const oneX = await renderIcon(id, svg, 1);
						nextDimensions[id] = { svg, width: oneX.width, height: oneX.height };
					}
				} catch {
					// SpritesColumn が不正 SVG の詳細を表示する。無効な画像は地図へ加えない。
				}
			}

			if (generation !== this.#generation) return;
			this.#renderedLocalSprites = nextRenderedSprites;
			this.#onDimensions(nextDimensions);

			if (!map || this.#map !== map) return;
			for (const [id, sprite] of nextRenderedSprites) {
				if (this.#synchronizedIconKeys.get(id) === sprite.key && map.hasImage(id)) continue;
				try {
					this.#addLocalSprite(map, sprite);
					this.#synchronizedIconKeys.set(id, sprite.key);
				} catch {
					this.#synchronizedIconKeys.delete(id);
				}
			}
		} catch {
			// 初期化エラーはダイアログ側に表示される。ローカル画像なしでも編集を継続する。
		}
	}

	#resolveMissingStyleImage = async (id: string) => {
		const map = this.#map;
		if (!map) return;
		const icon = this.#icons[id];
		if (icon === undefined) return;
		const key = iconKey(icon);
		const isCurrent = () => {
			const current = this.#icons[id];
			return this.#map === map && current !== undefined && iconKey(current) === key;
		};
		const cached = this.#renderedLocalSprites.get(id);
		if (cached?.key === key) {
			try {
				this.#addLocalSprite(map, cached);
				this.#synchronizedIconKeys.set(id, key);
			} catch {
				// 次の欠落画像解決時に再試行する。
			}
			return;
		}

		try {
			const { renderIcon } = await loadSpritore();
			if (!isCurrent()) return;
			const rendered = {
				...(await renderIcon(id, icon.svg, 2, spriteIconRenderOptions(icon))),
				key
			};
			if (!isCurrent()) return;
			this.#renderedLocalSprites.set(id, rendered);
			this.#addLocalSprite(map, rendered);
			this.#synchronizedIconKeys.set(id, key);
		} catch {
			// 無効な SVG や初期化エラーは欠落画像のまま扱う。
		}
	};
}
