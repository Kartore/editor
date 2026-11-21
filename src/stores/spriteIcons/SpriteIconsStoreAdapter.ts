/** MapLibre の textFitWidth / textFitHeight (icon-text-fit で拡大縮小をどう制限するか) */
export type SpriteTextFit = 'stretchOrShrink' | 'stretchOnly' | 'proportional';

/** 伸ばしてよい範囲 [開始, 終了] (SVG の論理ピクセル) */
export type SpriteStretchRange = [number, number];

/**
 * icon-text-fit 用のメタデータ (9-slice)。値は SVG の論理ピクセル。
 * sprite.json と地図には spritore がピクセル比と SDF の余白を反映した画像ピクセルで書く
 */
export type SpriteIconMetadata = {
	/** 横に伸ばしてよい範囲 (昇順・重ならない) */
	stretchX?: SpriteStretchRange[];
	/** 縦に伸ばしてよい範囲 (昇順・重ならない) */
	stretchY?: SpriteStretchRange[];
	/** 文字を載せてよい枠 [left, top, right, bottom] */
	content?: [number, number, number, number];
	textFitWidth?: SpriteTextFit;
	textFitHeight?: SpriteTextFit;
};

export type SpriteIcon = {
	svg: string;
	/** MapLibre の SDF アイコンとして扱う (単色。icon-color / icon-halo-* が効く)。false のときはキーごと省く */
	sdf?: true;
} & SpriteIconMetadata;

export type SpriteIcons = Record<string, SpriteIcon>;

export type SpriteIconsStoreAdapter = {
	id: string;
	load: () => Promise<SpriteIcons | null>;
	save: (icons: SpriteIcons) => Promise<void>;
};
