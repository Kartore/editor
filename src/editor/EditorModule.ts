import type { Component } from 'svelte';
import type {
	LayerSpecification,
	RequestParameters,
	ResourceType,
	StyleSpecification
} from 'maplibre-gl';

// @kartore/editor/types から型だけを公開するため、ここからは型だけのファイルを相対で import する
import type { StoredFont } from '../stores/fonts/FontsStoreAdapter.ts';
import type { SpriteIcons } from '../stores/spriteIcons/SpriteIconsStoreAdapter.ts';
import type {
	LocalDraftInspector,
	LocalDraftMeta,
	LocalDraftOpenResult,
	LocalDraftSummary
} from './localDraft/types.ts';

export type * from './localDraft/types.ts';
// アダプタが sprite アイコンの形 ({ svg, sdf? }) を複製せずに参照できるようにする
export type { SpriteIcon, SpriteIcons } from '../stores/spriteIcons/SpriteIconsStoreAdapter.ts';

export type EditorPreview = {
	style: StyleSpecification;
	label: string;
};

/** スタイルファイルの 1 リビジョン (アダプタ側では git コミット等に対応) */
export type StyleHistoryRevision = {
	/** リビジョン識別子 (コミット SHA 等)。loadStyleAtRevision に渡す */
	id: string;
	/** コミットメッセージ等の説明文 (全文)。表示側で 1 行目に切る */
	message: string;
	authorName: string;
	/** 外部アカウントを解決できた場合のみ */
	authorLogin?: string;
	avatarUrl?: string;
	/** ISO 8601 */
	authoredAt: string;
	/** リビジョンの外部ページ */
	htmlUrl?: string;
};

export type StyleHistoryPage = {
	revisions: StyleHistoryRevision[];
	hasNext: boolean;
};

export type StyleHistoryProvider = {
	/** getter で実装し、リアクティブに評価できるようにする */
	readonly available: boolean;
	/** 履歴の対象を表すラベル。available=false なら null */
	readonly label: string | null;
	/** 新しい順。page は 1 始まり */
	listRevisions: (options: {
		page: number;
		perPage?: number;
		/** 対応する provider は当該レイヤーを触った revision のみに絞る */
		scope?: { layerId: string };
	}) => Promise<StyleHistoryPage>;
	loadStyleAtRevision: (revisionId: string) => Promise<StyleSpecification>;
	/** 分割形式のみ。null はその revision にレイヤーが存在しないことを表す */
	loadLayerAtRevision?: (revisionId: string, layerId: string) => Promise<LayerSpecification | null>;
};

export type SaveProvider = {
	/** getter で実装し、リアクティブに評価できるようにする */
	readonly available: boolean;
	/**
	 * 保存する。`true` を返す (resolve する) と、コアが手元の保存を「保存済み」にする。
	 * ダイアログを開くだけで保存が後で終わる場合は何も返さず、終わったときに EditorApi.markSaved() を呼ぶ
	 */
	save: () => void | boolean | Promise<void | boolean>;
};

/**
 * 地図リクエストの URL の書き換え (MapLibre の transformRequest と同じ形)。`undefined` なら書き換えない。
 * 呼ばれるたびに評価されるので、結果が後で変わってもよい (キーをあとから取る等)。Promise を返してもよい
 */
export type EditorRequestTransformer = (
	url: string,
	resourceType?: ResourceType
) => RequestParameters | undefined | Promise<RequestParameters | undefined>;

/** 書き出しで作るファイル (パス → 中身) */
export type EditorExportFiles = Record<string, string | Uint8Array>;

/** buildStyleAssets の結果。スプライトとグリフのファイルと、その中身のハッシュ (SHA-256 の 16 進) */
export type EditorStyleAssets = {
	/** sprite.json / sprite.png / sprite@2x.json / sprite@2x.png (アイコンが無ければ空) */
	spriteFiles: EditorExportFiles;
	/** `<fontstack>/<start>-<end>.pbf` (フォントが無ければ空) */
	glyphFiles: EditorExportFiles;
	spriteHash: string | null;
	glyphsHash: string | null;
	/** スプライトとグリフの組のハッシュ */
	hash: string | null;
};

export type EditorStyleExportKind = 'current-mode' | 'mode-files' | 'runtime';

export type NewStyleHandler = () => void;

/** 外部ソースからエディタへ読み込むプロジェクト。省略した資産種別は現在値を保持する。 */
export type EditorProject = {
	style: StyleSpecification;
	assets?: {
		icons?: SpriteIcons;
		fonts?: Record<string, StoredFont>;
	};
};

export type EditorApi = {
	/** ホストアプリの package version。パック manifest など外部出力の生成元バージョン */
	readonly appVersion: string;
	/** store.mapStyle を返す。$derived / $effect 内で呼べばリアクティブに追跡される */
	getStyle: () => StyleSpecification;
	setStyle: (style: StyleSpecification) => void;
	/** 外部プロジェクトを読み込む。指定された資産はアップロード済みローカル資産として全置換する。 */
	loadProject: (project: EditorProject) => Promise<void>;
	/** ローカル sprite 元 SVG の現在値を返す */
	getSpriteIcons: () => SpriteIcons;
	/** ローカル sprite 元 SVG をマージせず全置換する */
	replaceSpriteIcons: (icons: SpriteIcons) => Promise<void>;
	/** 登録済みローカルフォントを bytes 込みですべて返す */
	getStoredFonts: () => Promise<Record<string, StoredFont>>;
	/** フォント bytes を読まず、変更監視に使える現在のメタデータを返す */
	getFontMetadata: () => Record<string, Omit<StoredFont, 'bytes'>>;
	/** 登録済みローカルフォントをマージせず全置換する */
	replaceStoredFonts: (fonts: Record<string, StoredFont>) => Promise<void>;
	setPreview: (preview: EditorPreview | null) => void;
	getPreview: () => EditorPreview | null;
	/** アダプタが履歴プロバイダを登録する */
	registerStyleHistoryProvider: (provider: StyleHistoryProvider) => void;
	/** アダプタが保存プロバイダを登録する */
	registerSaveProvider: (provider: SaveProvider) => void;
	/** 新規スタイル作成時に、現在のファイル等との接続を解除するハンドラを登録する */
	registerNewStyleHandler: (handler: NewStyleHandler) => void;
	/** アダプタが登録した Rail 項目の SecondColumn を開く */
	openRailItem: (moduleId: string, railItemId: string) => void;

	// ---- 手元の保存 (ローカル下書き)。保存の単位 = スコープ ----

	/** 開いているスコープ。スコープ無しは null */
	getDraftScope: () => string | null;
	/**
	 * 別のスコープを開く (保存先を切り替えて読み直す)。保存していない編集があれば復旧ダイアログを出し、選択を待って resolve する。
	 * 結果が `restored` のときはサーバーの版で上書きしないこと
	 */
	openDraftScope: (scope: string | null) => Promise<LocalDraftOpenResult>;
	/** スコープを開き終えるたびに呼ぶ (登録時に開き終えていれば直近の結果ですぐ呼ぶ)。解除関数を返す */
	onDraftOpened: (listener: (result: LocalDraftOpenResult) => void) => () => void;
	/** 開いているスコープの情報 (最後の編集時刻・保存済み・アダプタの欄) */
	getDraftMeta: () => LocalDraftMeta;
	/** アダプタの欄を読む・書く (module id ごと。コアは中身を見ない) */
	getDraftData: (moduleId: string) => unknown;
	setDraftData: (moduleId: string, data: unknown) => void;
	/** 保存できたことを記録する (中身は消さない)。data でアダプタの欄も同時に書き換えられる ({ [moduleId]: value }) */
	markSaved: (data?: Record<string, unknown>) => Promise<void>;
	/** 保存していない編集があるスコープの一覧 (新しい順) */
	listUnsavedDrafts: () => Promise<LocalDraftSummary[]>;
	/** 復旧ダイアログに「もとにしたもの」と警告を足す。解除関数を返す */
	registerDraftInspector: (inspector: LocalDraftInspector) => () => void;

	// ---- 地図 ----

	/** 地図リクエストの URL の書き換えを登録する。登録順に当て、最初に書き換えたものを使う。解除関数を返す */
	registerRequestTransformer: (transformer: EditorRequestTransformer) => () => void;

	// ---- 書き出し ----

	/** 開いているアイコンとフォントから、スプライトとグリフを作る (中身のハッシュ付き) */
	buildStyleAssets: () => Promise<EditorStyleAssets>;
	/**
	 * style.json (kind ごとの書き出し。既定 'current-mode') と、includeAssets ならスプライト (`sprite/…`)・
	 * グリフ (`glyphs/…`) をまとめたファイル群を作る。style.json の sprite / glyphs は相対パスに書き換わる。
	 * zip() で同じファイル群の決定的な ZIP を作れる
	 */
	createStyleExport: (options?: {
		kind?: EditorStyleExportKind;
		includeAssets?: boolean;
	}) => Promise<{
		files: EditorExportFiles;
		zip: () => Uint8Array;
		assets: EditorStyleAssets | null;
	}>;
};

export type EditorModulePage = {
	/** URL は `/${module.id}/${path}` になる (モジュール id で自動的に名前空間化) */
	path: string;
	/** 現在の URL (クエリを含む) を `url` prop で受け取る。SvelteKit の `$app/state` は使えない */
	component: Component<{ url: URL }>;
};

export type EditorMenuId = 'file' | 'edit' | 'view';

export type EditorRailPlacement = 'main' | 'bottom';

export type EditorModuleRailItem = {
	/** module id 内で一意な識別子。ホストが module id と組み合わせて名前空間化する */
	id: string;
	label: string;
	/** Rail に表示する Phosphor アイコン */
	icon: Component;
	/** 項目の選択時に SecondColumn としてマウントされるコンポーネント */
	secondColumn: Component;
	/** bottom は設定ボタンの直前、それ以外は組み込み編集モードの後ろに表示する */
	placement?: EditorRailPlacement;
};

// アダプタはこの型を `import type { EditorModule } from '@kartore/editor'` で使う (手書きの複製を持たない)。
export type EditorModule = {
	id: string;
	/**
	 * @deprecated `menuSections` / `headerStatus` へ移行すること。File の有効なメニューセクションが
	 * 無い場合は File メニュー末尾のフォールバックセクションに描画される。
	 */
	headerAction?: Component;
	/** 各メニュー末尾に区切り線付きで差し込まれる項目群 */
	menuSections?: Partial<Record<EditorMenuId, Component>>;
	/** トップバーのファイル名表示領域に並ぶ小さな状態表示 */
	headerStatus?: Component;
	/** +page.svelte 直下にマウントされるダイアログ・オーバーレイ */
	overlays?: Component[];
	/** Rail と SecondColumn に追加する adapter 固有の編集モード */
	railItems?: EditorModuleRailItem[];
	/** エディタ外のスタンドアロンページ (diff ビューア等)。setup は呼ばれない */
	pages?: EditorModulePage[];
	/** 起動時フック。返り値は setContext(`module:${id}`) で配られる */
	setup?: (editor: EditorApi) => unknown;
};
