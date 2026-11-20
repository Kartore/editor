import type { SpriteIcon, SpriteIcons } from './SpriteIconsStoreAdapter.ts';

/** 正規形の 1 件。sdf は true のときだけキーを持つ */
export const spriteIcon = (svg: string, sdf = false): SpriteIcon =>
	sdf ? { svg, sdf: true } : { svg };

const normalizeSpriteIcon = (value: unknown): SpriteIcon | null => {
	// 旧形式 (値が SVG 文字列)
	if (typeof value === 'string') return spriteIcon(value);
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
	const { svg, sdf } = value as { svg?: unknown; sdf?: unknown };
	return typeof svg === 'string' ? spriteIcon(svg, sdf === true) : null;
};

/**
 * 保存データを正規形のアイコン集合にする。旧形式 (`{ 名前: SVG }`) も新形式 (`{ 名前: { svg, sdf? } }`) も受ける。
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
