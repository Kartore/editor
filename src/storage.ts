/**
 * `@kartore/editor/storage` — 手元の保存 (ローカル下書き)。Svelte を使わないので、ホストのどのページからも使える
 */
export type {
	EditorStorage,
	KartoreStorageConfig,
	LocalDraftInspection,
	LocalDraftInspector,
	LocalDraftMeta,
	LocalDraftMetaAdapter,
	LocalDraftOpenResult,
	LocalDraftStore,
	LocalDraftSummary
} from './editor/localDraft/types.ts';
export { createDefaultEditorStorage } from './editor/localDraft/defaultStorage.ts';
export {
	createIndexedDbEditorStorage,
	DRAFTS_DATABASE_NAME,
	type IndexedDbEditorStorageOptions
} from './editor/localDraft/indexedDbStorage.ts';
export {
	emptyLocalDraftMeta,
	hasUnsavedEdits,
	isLocalDraftMeta,
	listUnsavedDrafts
} from './editor/localDraft/meta.ts';
