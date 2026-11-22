import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import type { FontCatalog } from '#src/editor/EditorModule.ts';

type Loaded = { names: string[] } | { error: string };

/** アダプタが登録した、text-font の候補に足すフォント (registerFontCatalog) */
export class FontCatalogContext {
	#catalogs = $state<FontCatalog[]>([]);
	#loaded = new SvelteMap<FontCatalog, Loaded>();
	/** 読んでいる一覧 (画面には出さないのでリアクティブにしない) */
	#loading: FontCatalog[] = [];

	register(catalog: FontCatalog) {
		this.#catalogs = [...this.#catalogs, catalog];
	}

	/** available な一覧 */
	get catalogs(): FontCatalog[] {
		return this.#catalogs.filter((catalog) => catalog.available);
	}

	/** 読み終えたフォントの名前 (重複なし)。読んでいなければ load() を呼ぶ */
	get fontNames(): string[] {
		const names = this.catalogs.flatMap((catalog) => {
			const loaded = this.#loaded.get(catalog);
			return loaded && 'names' in loaded ? loaded.names : [];
		});
		return names.filter((name, index) => names.indexOf(name) === index);
	}

	/** 一覧ごとの読んだ結果 (見出し・名前・エラー) */
	get sections(): { label: string; names: string[]; error: string | null }[] {
		return this.catalogs.map((catalog) => {
			const loaded = this.#loaded.get(catalog);
			return {
				label: catalog.label,
				names: loaded && 'names' in loaded ? loaded.names : [],
				error: loaded && 'error' in loaded ? loaded.error : null
			};
		});
	}

	/** まだ読んでいない一覧を読む (一覧ごとに 1 回だけ。失敗したら次に呼んだときに読み直す) */
	load() {
		for (const catalog of this.catalogs) {
			const loaded = this.#loaded.get(catalog);
			if ((loaded && 'names' in loaded) || this.#loading.includes(catalog)) continue;
			this.#loading.push(catalog);
			catalog
				.list()
				.then(
					(names) => this.#loaded.set(catalog, { names }),
					(error: unknown) =>
						this.#loaded.set(catalog, {
							error: error instanceof Error ? error.message : String(error)
						})
				)
				.finally(() => {
					this.#loading = this.#loading.filter((item) => item !== catalog);
				});
		}
	}
}

const KEY = Symbol('font-catalog');

export const provideFontCatalog = (): FontCatalogContext =>
	setContext(KEY, new FontCatalogContext());

export const useFontCatalog = (): FontCatalogContext | undefined => getContext(KEY);
