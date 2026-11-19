import type { Component } from 'svelte';

import { adapterModules } from '#src/app/adapters.ts';

/** `${module.id}/${page.path}` (先頭・末尾の `/` なし) に一致するアダプタページを返す */
export const findModulePage = (modulePath: string): Component<{ url: URL }> | null =>
	adapterModules
		.flatMap((module) => (module.pages ?? []).map((page) => ({ module, page })))
		.find(({ module, page }) => modulePath === `${module.id}/${page.path}`)?.page.component ?? null;
