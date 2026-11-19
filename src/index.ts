/**
 * `@kartore/editor` — エディタの Svelte コンポーネント。
 * 通常のホストは kartore() プリセット (`@kartore/editor/vite`) が SPA を組み立てるので、直接使うのは独自の画面に埋め込むときだけ
 */
// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient 宣言 (非 module) をホスト側の型チェックからも辿れるようにする
/// <reference path="./typings/EyeDropper.d.ts" />
export { default as Editor } from './app/Editor.svelte';
export { default as EditorRoot } from './app/EditorRoot.svelte';
export type * from './types.ts';
