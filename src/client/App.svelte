<script lang="ts">
	import Editor from '#src/app/Editor.svelte';
	import EditorRoot from '#src/app/EditorRoot.svelte';
	import type { EditorStorage } from '#src/editor/localDraft/types.ts';

	import { findModulePage } from './modulePages.ts';
	import NotFound from './NotFound.svelte';
	import { resolveClientRoute } from './routing.ts';

	let {
		appVersion,
		base = '/',
		storage,
		scope = null
	}: {
		appVersion: string;
		base?: string;
		storage?: EditorStorage;
		scope?: string | null;
	} = $props();

	// SPA のルーティング: `<base>` はエディタ、`<base><module id>/<page path>` はアダプタページ、base の外は 404。
	// アダプタページは window.open 等のフルロードで開かれるため、クライアント側遷移は扱わない
	const url = new URL(location.href);
	const route = $derived(resolveClientRoute(url.pathname, base));
	const ModulePage = $derived(route.kind === 'page' ? findModulePage(route.modulePath) : null);
</script>

<EditorRoot>
	{#if route.kind === 'editor'}
		<Editor {appVersion} {storage} {scope} />
	{:else if ModulePage}
		<ModulePage {url} />
	{:else}
		<NotFound />
	{/if}
</EditorRoot>
