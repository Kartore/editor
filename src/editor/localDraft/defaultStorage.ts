import { indexedDbFontsStoreAdapter } from '../../stores/fonts/indexedDbFontsStoreAdapter.ts';
import { localStorageMapStyleStoreAdapter } from '../../stores/mapStyle/localStorageMapStyleStoreAdapter.ts';
import { localStorageSpriteIconsStoreAdapter } from '../../stores/spriteIcons/localStorageSpriteIconsStoreAdapter.ts';

import { createIndexedDbEditorStorage } from './indexedDbStorage.ts';
import { isLocalDraftMeta } from './meta.ts';
import type { EditorStorage, LocalDraftMetaAdapter, LocalDraftStore } from './types.ts';

const LEGACY_META_KEY = 'kartore:draft-meta';
const LEGACY_STYLE_KEY = 'kartore:style';
const LEGACY_ICONS_KEY = 'kartore:sprite-svgs';

const legacyMeta: LocalDraftMetaAdapter = {
	load: async () => {
		try {
			const value: unknown = JSON.parse(localStorage.getItem(LEGACY_META_KEY) ?? 'null');
			return isLocalDraftMeta(value) ? value : null;
		} catch {
			return null;
		}
	},
	save: async (meta) => {
		localStorage.setItem(LEGACY_META_KEY, JSON.stringify(meta));
	}
};

/** スコープ無しの保存先 = 今までと同じ localStorage (`kartore:style` / `kartore:sprite-svgs`) と IndexedDB (`kartore-fonts`) */
const legacyStore: LocalDraftStore = {
	style: localStorageMapStyleStoreAdapter,
	icons: localStorageSpriteIconsStoreAdapter,
	fonts: indexedDbFontsStoreAdapter,
	meta: legacyMeta,
	clear: async () => {
		localStorage.removeItem(LEGACY_STYLE_KEY);
		localStorage.removeItem(LEGACY_ICONS_KEY);
		localStorage.removeItem(LEGACY_META_KEY);
		const fonts = (await indexedDbFontsStoreAdapter.load()) ?? {};
		await Promise.all(Object.keys(fonts).map((name) => indexedDbFontsStoreAdapter.remove(name)));
	}
};

/**
 * 何も渡さないときのストレージ。スコープ無しは今までと同じ保存先を使い、確認ダイアログも出さない。
 * スコープ付きで開かれたときは IndexedDB (`kartore-drafts`) にスコープごとに置く
 */
export const createDefaultEditorStorage = (): EditorStorage => {
	const scoped = createIndexedDbEditorStorage({ confirmUnsaved: false });
	return {
		id: 'default',
		confirmUnsaved: false,
		open: (scope) => (scope === null ? legacyStore : scoped.open(scope)),
		listDrafts: scoped.listDrafts
	};
};
