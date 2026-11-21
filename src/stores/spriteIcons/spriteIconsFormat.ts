import type {
	SpriteIcon,
	SpriteIconMetadata,
	SpriteIcons,
	SpriteStretchRange,
	SpriteTextFit
} from './SpriteIconsStoreAdapter.ts';

export const SPRITE_TEXT_FIT_VALUES = [
	'stretchOrShrink',
	'stretchOnly',
	'proportional'
] as const satisfies readonly SpriteTextFit[];

/** svg 以外の設定 (sdf とメタデータ)。sprites.json のエントリオブジェクトに入るキーでもある */
export const SPRITE_ICON_SETTING_KEYS = [
	'sdf',
	'stretchX',
	'stretchY',
	'content',
	'textFitWidth',
	'textFitHeight'
] as const;

export type SpriteIconSettings = { sdf?: boolean } & SpriteIconMetadata;

const copyRanges = (ranges: readonly SpriteStretchRange[] | undefined) =>
	ranges && ranges.length > 0
		? ranges.map(([start, end]): SpriteStretchRange => [start, end])
		: undefined;

/**
 * 正規形の 1 件。sdf は true のときだけ、メタデータは値のあるもの (空でない範囲) だけキーを持つ。
 * 配列は複製するので、呼び出し元の ($state の) オブジェクトを持ち込まない
 */
export const spriteIcon = (svg: string, settings: SpriteIconSettings = {}): SpriteIcon => {
	const icon: SpriteIcon = { svg };
	if (settings.sdf === true) icon.sdf = true;
	const stretchX = copyRanges(settings.stretchX);
	if (stretchX) icon.stretchX = stretchX;
	const stretchY = copyRanges(settings.stretchY);
	if (stretchY) icon.stretchY = stretchY;
	if (settings.content) {
		const [left, top, right, bottom] = settings.content;
		icon.content = [left, top, right, bottom];
	}
	if (settings.textFitWidth) icon.textFitWidth = settings.textFitWidth;
	if (settings.textFitHeight) icon.textFitHeight = settings.textFitHeight;
	return icon;
};

/** svg 以外の設定があるか (sprites.json でエントリをオブジェクトにするかどうか) */
export const hasSpriteIconSettings = (icon: SpriteIcon): boolean =>
	SPRITE_ICON_SETTING_KEYS.some((key) => icon[key] !== undefined);

/** spritore の renderIcon / buildSpriteSheet に渡す設定 (sdf とメタデータ。論理ピクセル) */
export const spriteIconRenderOptions = (icon: SpriteIcon) => ({
	sdf: icon.sdf === true,
	...(icon.stretchX ? { stretchX: icon.stretchX } : {}),
	...(icon.stretchY ? { stretchY: icon.stretchY } : {}),
	...(icon.content ? { content: icon.content } : {}),
	...(icon.textFitWidth ? { textFitWidth: icon.textFitWidth } : {}),
	...(icon.textFitHeight ? { textFitHeight: icon.textFitHeight } : {})
});

const isFiniteNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

const readRanges = (value: unknown): SpriteStretchRange[] | null | undefined => {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return null;
	const ranges: SpriteStretchRange[] = [];
	for (const range of value) {
		if (!Array.isArray(range) || range.length !== 2 || !range.every(isFiniteNumber)) return null;
		ranges.push([range[0], range[1]]);
	}
	return ranges;
};

const readTextFit = (value: unknown): SpriteTextFit | null | undefined => {
	if (value === undefined) return undefined;
	return SPRITE_TEXT_FIT_VALUES.find((fit) => fit === value) ?? null;
};

/**
 * 保存データや sprites.json のエントリから svg 以外の設定を読む。形が違えば null
 * (範囲が画像に収まっているかは spritore が描画時に MapLibre の規則で調べる)
 */
export const readSpriteIconSettings = (
	value: Record<string, unknown>
): SpriteIconSettings | null => {
	const { sdf, stretchX, stretchY, content, textFitWidth, textFitHeight } = value;
	if (sdf !== undefined && typeof sdf !== 'boolean') return null;
	const rangesX = readRanges(stretchX);
	const rangesY = readRanges(stretchY);
	if (rangesX === null || rangesY === null) return null;
	if (
		content !== undefined &&
		(!Array.isArray(content) || content.length !== 4 || !content.every(isFiniteNumber))
	) {
		return null;
	}
	const fitWidth = readTextFit(textFitWidth);
	const fitHeight = readTextFit(textFitHeight);
	if (fitWidth === null || fitHeight === null) return null;
	return {
		sdf: sdf === true,
		stretchX: rangesX,
		stretchY: rangesY,
		content: content as [number, number, number, number] | undefined,
		textFitWidth: fitWidth,
		textFitHeight: fitHeight
	};
};

const normalizeSpriteIcon = (value: unknown): SpriteIcon | null => {
	// 旧形式 (値が SVG 文字列)
	if (typeof value === 'string') return spriteIcon(value);
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (typeof record.svg !== 'string') return null;
	const settings = readSpriteIconSettings(record);
	return settings ? spriteIcon(record.svg, settings) : null;
};

/**
 * 保存データを正規形のアイコン集合にする。旧形式 (`{ 名前: SVG }`) も新形式 (`{ 名前: { svg, sdf?, ... } }`) も受ける。
 * 不正な値が 1 つでもあれば null
 */
export const normalizeSpriteIcons = (value: unknown): SpriteIcons | null => {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
	const icons: SpriteIcons = {};
	for (const [name, entry] of Object.entries(value)) {
		const icon = normalizeSpriteIcon(entry);
		if (!icon) return null;
		icons[name] = icon;
	}
	return icons;
};
