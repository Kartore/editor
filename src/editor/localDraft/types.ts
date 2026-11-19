import type { FontsStoreAdapter } from '../../stores/fonts/FontsStoreAdapter.ts';
import type { MapStyleStoreAdapter } from '../../stores/mapStyle/MapStyleStoreAdapter.ts';
import type { SpriteIconsStoreAdapter } from '../../stores/spriteIcons/SpriteIconsStoreAdapter.ts';

/**
 * 手元の保存 (ローカル下書き) に中身と一緒に持つ情報。
 * 「保存済み」は、最後の編集のあとにアダプタやホストが保存できたことを表す (中身は消さない)
 */
export type LocalDraftMeta = {
	/** 最後に編集した時刻 (Unix ms)。一度も編集していなければ null */
	editedAt: number | null;
	/** 最後に「保存済み」にした時刻 (Unix ms) */
	savedAt: number | null;
	/** 最後の編集のあとに保存済みにされたか。編集が無いときも true */
	saved: boolean;
	/**
	 * アダプタが自由に書き込める欄 (module id → JSON で表せる値)。コアは中身を見ない。
	 * 例: cloud.map はもとにした下書きの改訂 (`{ base: 12 }`)、GitHub はブランチとコミット
	 */
	adapters: Record<string, unknown>;
};

export type LocalDraftMetaAdapter = {
	load: () => Promise<LocalDraftMeta | null>;
	save: (meta: LocalDraftMeta) => Promise<void>;
};

/** 1 つのスコープ (保存の単位) の保存先一式 */
export type LocalDraftStore = {
	style: MapStyleStoreAdapter;
	icons: SpriteIconsStoreAdapter;
	fonts: FontsStoreAdapter;
	meta: LocalDraftMetaAdapter;
	/** このスコープの中身 (スタイル・アイコン・フォント・情報) をすべて消す */
	clear: () => Promise<void>;
};

export type LocalDraftSummary = {
	scope: string;
	meta: LocalDraftMeta;
};

/**
 * 手元の保存のしかた。ホストが Editor の `storage` prop か kartore({ storage }) で差し替える。
 * スコープは保存の単位を表す文字列 (cloud.map なら `<環境>:<ユーザー>:<組織>:<スタイル>`)。
 * `null` は「スコープ無し」(kartore-web など、今までの 1 つだけの保存)
 */
export type EditorStorage = {
	id: string;
	open: (scope: string | null) => LocalDraftStore;
	/** 下書きの情報を持つスコープの一覧 (スコープ無しは含めない) */
	listDrafts: () => Promise<LocalDraftSummary[]>;
	/**
	 * 保存していない編集があるとき、開くときの復旧ダイアログとブラウザを閉じるときの確認を出すか。
	 * 既定ストレージ (今までの動き) は false
	 */
	confirmUnsaved: boolean;
};

/** 復旧ダイアログに出す、アダプタからの補足 */
export type LocalDraftInspection = {
	/** もとにしたもの (例: 「下書き rev 12」「main @ 1a2b3c4」) */
	base?: string;
	/** 注意 (例: 「もとにした下書きより新しい下書きがある」「GitHub のブランチが進んでいる」) */
	warnings?: string[];
};

export type LocalDraftInspector = (draft: {
	scope: string | null;
	meta: LocalDraftMeta;
}) => LocalDraftInspection | null | undefined | Promise<LocalDraftInspection | null | undefined>;

/**
 * スコープを開いた結果。
 * - `none`: 保存していない編集は無かった (アダプタは必要ならサーバーの版を読み込む)
 * - `restored`: 保存していない編集を復旧した (アダプタはサーバーの版で上書きしないこと)
 * - `discarded`: 保存していない編集を捨てた (スコープは空になっている)
 */
export type LocalDraftOpenResult = {
	scope: string | null;
	draft: 'none' | 'restored' | 'discarded';
	meta: LocalDraftMeta;
};

/** kartore({ storage: './path/to/module.ts' }) で指すモジュールの default export */
export type KartoreStorageConfig = {
	storage?: EditorStorage;
	/** 最初に開くスコープ。関数なら起動時に呼ぶ (Promise を返すと、解決するまで読み込み中を表示する) */
	scope?: string | null | (() => string | null | Promise<string | null>);
};
