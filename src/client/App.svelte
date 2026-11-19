<script lang="ts">
	import Editor from '#src/app/Editor.svelte';
	import EditorRoot from '#src/app/EditorRoot.svelte';
	import type { EditorStorage } from '#src/editor/localDraft/types.ts';

	import { findModulePage } from './modulePages.ts';
	import NotFound from './NotFound.svelte';

	let {
		appVersion,
		storage,
		scope = null
	}: { appVersion: string; storage?: EditorStorage; scope?: string | null } = $props();

	// SPA のルーティング: `/` はエディタ、`/<module id>/<page path>` はアダプタページ。
	// アダプタページは window.open 等のフルロードで開かれるため、クライアント側遷移は扱わない
	const url = new URL(location.href);
	const modulePath = url.pathname.replace(/^\/+|\/+$/g, '');
	const ModulePage = modulePath === '' ? null : findModulePage(modulePath);
</script>

<EditorRoot>
	{#if modulePath === ''}
		<Editor {appVersion} {storage} {scope} />
	{:else if ModulePage}
		<ModulePage {url} />
	{:else}
		<NotFound />
	{/if}
</EditorRoot>
