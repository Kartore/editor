declare module 'virtual:kartore-adapter' {
	import type { EditorModule } from '#src/editor/EditorModule.ts';
	import type { Component, Snippet } from 'svelte';

	export type AdapterProvider = Component<{ children: Snippet }>;

	export const adapterModules: EditorModule[];
	export const adapterProviders: AdapterProvider[];
}

declare module 'virtual:kartore-adapter/server' {
	import type { AdapterApiHandler } from '../../server/runtime.ts';

	export type { AdapterApiHandler };
	export const adapterApiHandlers: AdapterApiHandler[];
}
