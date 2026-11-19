<script lang="ts">
	import type { ComponentProps } from 'svelte';

	import { cn } from '#src/utils/tailwindUtil.ts';

	import type CodeMirrorEditor from './CodeMirrorEditor.svelte';

	// CodeMirror (@codemirror/*・@lezer/*) は大きいので最初の JS に入れず、エディタを初めて表示するときに読み込む
	let props: ComponentProps<typeof CodeMirrorEditor> = $props();
	const editor = import('./CodeMirrorEditor.svelte');
</script>

{#await editor}
	<!-- 読み込み中も同じ場所を占めて、レイアウトが動かないようにする -->
	<div class={cn('flex h-full min-h-0 w-full flex-col', props.class)}></div>
{:then { default: Editor }}
	<Editor {...props} />
{/await}
