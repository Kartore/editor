import type { EditorStorage, LocalDraftMeta, LocalDraftSummary } from './types.ts';

export const emptyLocalDraftMeta = (): LocalDraftMeta => ({
	editedAt: null,
	savedAt: null,
	saved: true,
	adapters: {}
});

const isNullableNumber = (value: unknown): value is number | null =>
	value === null || (typeof value === 'number' && Number.isFinite(value));

export const isLocalDraftMeta = (value: unknown): value is LocalDraftMeta => {
	if (typeof value !== 'object' || value === null) return false;
	const meta = value as Partial<LocalDraftMeta>;
	return (
		isNullableNumber(meta.editedAt) &&
		isNullableNumber(meta.savedAt) &&
		typeof meta.saved === 'boolean' &&
		typeof meta.adapters === 'object' &&
		meta.adapters !== null &&
		!Array.isArray(meta.adapters)
	);
};

/** 保存していない編集があるか */
export const hasUnsavedEdits = (meta: LocalDraftMeta): boolean =>
	!meta.saved && meta.editedAt !== null;

/** listDrafts の結果のうち、保存していない編集があるものを新しい順に */
export const filterUnsavedDrafts = (drafts: LocalDraftSummary[]): LocalDraftSummary[] =>
	drafts
		.filter(({ meta }) => hasUnsavedEdits(meta))
		.sort((left, right) => (right.meta.editedAt ?? 0) - (left.meta.editedAt ?? 0));

/** 保存していない編集があるスコープの一覧 (新しい順)。ホストのスタイル一覧に印を出すのに使う */
export const listUnsavedDrafts = async (storage: EditorStorage): Promise<LocalDraftSummary[]> =>
	filterUnsavedDrafts(await storage.listDrafts());
