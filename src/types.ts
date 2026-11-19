/**
 * `@kartore/editor/types` — アダプタ向けの型だけの入口。
 * Svelte コンポーネントやストアの実装を辿らないので、アダプタの tsc からも軽く参照できる
 */
export type * from './editor/EditorModule.ts';
export type {
	AdapterApiHandler,
	KartoreKv,
	KartoreKvPutOptions,
	KartoreRuntime
} from './server/runtime.ts';
