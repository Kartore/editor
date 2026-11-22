import { getContext, setContext } from 'svelte';

import type { SourceCatalog } from '#src/editor/EditorModule.ts';

/** アダプタが登録した「ソースを追加」の一覧 (registerSourceCatalog) */
export class SourceCatalogContext {
	#catalogs = $state<SourceCatalog[]>([]);

	register(catalog: SourceCatalog) {
		this.#catalogs = [...this.#catalogs, catalog];
	}

	/** available な一覧 */
	get catalogs(): SourceCatalog[] {
		return this.#catalogs.filter((catalog) => catalog.available);
	}
}

const KEY = Symbol('source-catalog');

export const provideSourceCatalog = (): SourceCatalogContext =>
	setContext(KEY, new SourceCatalogContext());

export const useSourceCatalog = (): SourceCatalogContext | undefined => getContext(KEY);
