import type { StyleSpecification } from 'maplibre-gl';

import { FontsStore } from '#src/stores/fonts';
import { MapStyleStore } from '#src/stores/mapStyle';
import { SpriteIconsStore } from '#src/stores/spriteIcons';
import { createEmptyStyle } from '#src/utils/styleCreate.ts';
import type { StyleExportKind } from '#src/utils/styleExport.ts';
import {
	buildStyleAssetBundle,
	createStyleExportArchiveFiles,
	type StyleAssetBundle,
	type StyleExportArchiveAssets
} from '#src/utils/styleExportArchive.ts';
import type { StylePackFiles } from '#src/utils/stylePack.ts';
import { createStylePackArchive } from '#src/utils/stylePackArchive.ts';

import type { EditorProject } from './EditorModule.ts';
import { createDefaultEditorStorage } from './localDraft/defaultStorage.ts';
import { LocalDraftSession } from './localDraft/localDraftSession.svelte.ts';
import type { EditorStorage } from './localDraft/types.ts';
import { applyProjectLoad } from './projectLoad.ts';

/**
 * 編集中のドキュメント: スタイル・アイコン・フォントのストアと、それらの手元の保存 (スコープ) をまとめたもの。
 * 画面の状態 (選択・パネル・プレビュー) は持たない
 */
export class EditorDocument {
	readonly localDraft: LocalDraftSession;
	readonly style: MapStyleStore;
	readonly icons: SpriteIconsStore;
	readonly fonts: FontsStore;
	/** 最初のスコープを開いて (必要なら) サンプルを読み込むまで true */
	initializing = $state(true);
	initializeError = $state<Error | null>(null);

	constructor({ storage, scope }: { storage?: EditorStorage; scope: string | null }) {
		this.localDraft = new LocalDraftSession({
			storage: storage ?? createDefaultEditorStorage(),
			scope
		});
		const draft = this.localDraft.initialDraft;
		const onChange = this.localDraft.markChanged;
		this.style = new MapStyleStore({
			adapter: draft.style,
			initialStyle: createEmptyStyle(),
			onChange
		});
		this.icons = new SpriteIconsStore({ adapter: draft.icons, onChange });
		this.fonts = new FontsStore({ adapter: draft.fonts, onChange });
	}

	/** ストアの読み込み・スコープの切り替え・復旧の選択のどれかが終わっていない */
	get loading(): boolean {
		return (
			this.style.isLoading ||
			this.icons.isLoading ||
			this.fonts.isLoading ||
			this.initializing ||
			this.localDraft.opening
		);
	}

	/** 閉じる前に確かめるべき保存していない編集があるか (確認はストレージが求めるときだけ) */
	get shouldConfirmUnload(): boolean {
		return this.localDraft.storage.confirmUnsaved && this.localDraft.hasUnsavedEdits;
	}

	/** 最初のスコープを開く。スコープ無しで空なら今までどおりサンプルの初期プロジェクトを読む */
	initialize = async (): Promise<void> => {
		try {
			const opened = await this.localDraft.start({
				style: this.style,
				icons: this.icons,
				fonts: this.fonts,
				initialStyle: createEmptyStyle
			});
			// スコープ付きのときは空から始める (中身はアダプタが読み込む)
			if (opened.scope !== null || !this.style.needsInitialProject) return;
			const { loadInitialProject } = await import('#src/samples/initialProject.ts');
			await this.loadProject(await loadInitialProject());
			await this.localDraft.markPristine();
		} catch (error) {
			this.initializeError = error instanceof Error ? error : new Error(String(error));
		} finally {
			this.initializing = false;
		}
	};

	/** 外部プロジェクトを読み込む。資産を先に置き換え、すべて成功してからスタイルを切り替える */
	loadProject = (project: EditorProject): Promise<void> =>
		applyProjectLoad(
			{
				replaceStyle: this.style.replaceMapStyle,
				replaceSpriteIcons: this.icons.replaceIcons,
				replaceStoredFonts: this.fonts.replaceStoredFonts
			},
			project
		);

	/** 書き出しに使う今のアセット */
	exportAssets = (): StyleExportArchiveAssets => ({
		icons: $state.snapshot(this.icons.icons),
		fontstacks: Object.keys(this.fonts.fonts),
		getLoadedFont: this.fonts.getLoadedFont
	});

	snapshotStyle = (): StyleSpecification =>
		$state.snapshot(this.style.mapStyle as object) as StyleSpecification;

	buildStyleAssets = (): Promise<StyleAssetBundle> => buildStyleAssetBundle(this.exportAssets());

	createStyleExport = async ({
		kind = 'current-mode',
		includeAssets = false
	}: { kind?: StyleExportKind; includeAssets?: boolean } = {}): Promise<{
		files: StylePackFiles;
		assets: StyleAssetBundle | null;
		zip: () => Uint8Array;
	}> => {
		const style = this.snapshotStyle();
		const assets = includeAssets ? await this.buildStyleAssets() : null;
		const files = createStyleExportArchiveFiles(style, kind, {
			spriteFiles: assets?.spriteFiles,
			glyphFiles: assets?.glyphFiles
		});
		return { files, assets, zip: () => createStylePackArchive(files) };
	};

	/** 予約中の保存 (スタイル・情報) をすぐに書き出す。ページを閉じる・アンマウントのときに呼ぶ */
	flush = () => {
		this.style.flushSave();
		this.localDraft.flush();
	};

	destroy = () => {
		this.flush();
		this.fonts.destroy();
	};
}
