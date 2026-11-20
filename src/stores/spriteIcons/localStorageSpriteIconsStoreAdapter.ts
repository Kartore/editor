import type { SpriteIconsStoreAdapter } from './SpriteIconsStoreAdapter.ts';
import { normalizeSpriteIcons } from './spriteIconsFormat.ts';

// 旧形式 (値が SVG 文字列) の頃からのキー。値の形が変わっても読み込み時に変換するので据え置く
const STORAGE_KEY = 'kartore:sprite-svgs';

export const localStorageSpriteIconsStoreAdapter: SpriteIconsStoreAdapter = {
	id: 'local-storage',
	load: async () => {
		const storedValue = localStorage.getItem(STORAGE_KEY);
		if (storedValue === null) return null;

		try {
			const parsedValue: unknown = JSON.parse(storedValue);
			return normalizeSpriteIcons(parsedValue);
		} catch {
			return null;
		}
	},
	save: async (icons) => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(icons));
	}
};
