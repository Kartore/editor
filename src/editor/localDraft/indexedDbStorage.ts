import type { FontMeta, Fonts, StoredFont } from '../../stores/fonts/FontsStoreAdapter.ts';
import { isStoredFont } from '../../stores/fonts/indexedDbFontsStoreAdapter.ts';
import {
	createDatabaseOpener,
	requestResult,
	transactionComplete,
	type IndexedDbFactoryProvider
} from '../../stores/indexedDb.ts';
import { isStyleSpecification } from '../../stores/mapStyle/localStorageMapStyleStoreAdapter.ts';
import { isSpriteIcons } from '../../stores/spriteIcons/localStorageSpriteIconsStoreAdapter.ts';

import { isLocalDraftMeta } from './meta.ts';
import type { EditorStorage, LocalDraftStore, LocalDraftSummary } from './types.ts';

export const DRAFTS_DATABASE_NAME = 'kartore-drafts';

const STYLES = 'styles';
const ICONS = 'icons';
const FONTS = 'fonts';
const META = 'meta';
const STORES = [STYLES, ICONS, FONTS, META] as const;

// スコープ無し (null) は空文字のキーで持ち、listDrafts には出さない
const scopeKey = (scope: string | null): string => scope ?? '';

const fontMeta = ({ familyName, styleName, addedAt }: StoredFont): FontMeta => ({
	familyName,
	styleName,
	addedAt
});

export type IndexedDbEditorStorageOptions = {
	/** 既定 'kartore-drafts' */
	databaseName?: string;
	/** 保存していない編集の確認 (復旧ダイアログ・beforeunload) を出すか。既定 true */
	confirmUnsaved?: boolean;
	getFactory?: IndexedDbFactoryProvider;
};

/**
 * スタイル・アイコン・フォント・情報をスコープごとに IndexedDB に置くストレージ。
 * localStorage は origin 全体で 5 MB ほどしかないので、スタイルごとに分けるときはこちらを使う
 */
export const createIndexedDbEditorStorage = ({
	databaseName = DRAFTS_DATABASE_NAME,
	confirmUnsaved = true,
	getFactory
}: IndexedDbEditorStorageOptions = {}): EditorStorage => {
	const openDatabase = createDatabaseOpener({
		name: databaseName,
		version: 1,
		stores: STORES,
		getFactory
	});

	const read = async (store: string, key: IDBValidKey): Promise<unknown> => {
		const database = await openDatabase();
		return requestResult(database.transaction(store, 'readonly').objectStore(store).get(key));
	};

	const write = async (
		stores: string | string[],
		run: (transaction: IDBTransaction) => void
	): Promise<void> => {
		const database = await openDatabase();
		const transaction = database.transaction(stores, 'readwrite');
		const completed = transactionComplete(transaction);
		run(transaction);
		await completed;
	};

	// [scope, name] の配列キーで、あるスコープのフォントだけを取る範囲 (配列は文字列より後ろに並ぶ)
	const fontRange = (key: string) => IDBKeyRange.bound([key], [key, []]);

	const open = (scope: string | null): LocalDraftStore => {
		const key = scopeKey(scope);
		return {
			style: {
				id: `indexed-db:${key}`,
				load: async () => {
					const value = await read(STYLES, key);
					return isStyleSpecification(value) ? value : null;
				},
				save: (style) =>
					write(STYLES, (transaction) => transaction.objectStore(STYLES).put(style, key))
			},
			icons: {
				id: `indexed-db:${key}`,
				load: async () => {
					const value = await read(ICONS, key);
					return isSpriteIcons(value) ? value : null;
				},
				save: (icons) =>
					write(ICONS, (transaction) => transaction.objectStore(ICONS).put(icons, key))
			},
			fonts: {
				id: `indexed-db:${key}`,
				load: async (): Promise<Fonts> => {
					const database = await openDatabase();
					const store = database.transaction(FONTS, 'readonly').objectStore(FONTS);
					const [keys, values] = await Promise.all([
						requestResult(store.getAllKeys(fontRange(key))),
						requestResult(store.getAll(fontRange(key)))
					]);
					const fonts: Fonts = {};
					keys.forEach((fontKey, index) => {
						const name = Array.isArray(fontKey) ? fontKey[1] : undefined;
						const value = values[index];
						if (typeof name === 'string' && isStoredFont(value)) fonts[name] = fontMeta(value);
					});
					return fonts;
				},
				get: async (name) => {
					const value = await read(FONTS, [key, name]);
					return isStoredFont(value) ? value : null;
				},
				save: (name, font) =>
					write(FONTS, (transaction) => transaction.objectStore(FONTS).put(font, [key, name])),
				remove: (name) =>
					write(FONTS, (transaction) => transaction.objectStore(FONTS).delete([key, name]))
			},
			meta: {
				load: async () => {
					const value = await read(META, key);
					return isLocalDraftMeta(value) ? value : null;
				},
				save: (meta) => write(META, (transaction) => transaction.objectStore(META).put(meta, key))
			},
			clear: () =>
				write([...STORES], (transaction) => {
					transaction.objectStore(STYLES).delete(key);
					transaction.objectStore(ICONS).delete(key);
					transaction.objectStore(META).delete(key);
					transaction.objectStore(FONTS).delete(fontRange(key));
				})
		};
	};

	return {
		id: `indexed-db:${databaseName}`,
		confirmUnsaved,
		open,
		listDrafts: async (): Promise<LocalDraftSummary[]> => {
			const database = await openDatabase();
			const store = database.transaction(META, 'readonly').objectStore(META);
			const [keys, values] = await Promise.all([
				requestResult(store.getAllKeys()),
				requestResult(store.getAll())
			]);
			const drafts: LocalDraftSummary[] = [];
			keys.forEach((scope, index) => {
				const meta = values[index];
				if (typeof scope === 'string' && scope !== '' && isLocalDraftMeta(meta)) {
					drafts.push({ scope, meta });
				}
			});
			return drafts;
		}
	};
};
