import type { SourceCatalogContext } from '#src/contexts/sourceCatalog.svelte.ts';
import type { StyleHistoryContext } from '#src/contexts/styleHistory.svelte.ts';

import type {
	EditorApi,
	EditorPreview,
	EditorProject,
	LocalDraftMeta,
	NewStyleHandler,
	SaveProvider
} from './EditorModule.ts';
import type { EditorDocument } from './editorDocument.svelte.ts';
import type { RequestTransformerRegistry } from './requestTransform.ts';

export type EditorApiDependencies = {
	appVersion: () => string;
	document: EditorDocument;
	/** 画面側の後始末 (プレビュー解除など) を含んだ loadProject */
	loadProject: (project: EditorProject) => Promise<void>;
	preview: { get: () => EditorPreview | null; set: (preview: EditorPreview | null) => void };
	styleHistory: Pick<StyleHistoryContext, 'register'>;
	sourceCatalog: Pick<SourceCatalogContext, 'register'>;
	saveProviders: SaveProvider[];
	newStyleHandlers: NewStyleHandler[];
	openRailItem: EditorApi['openRailItem'];
	requestTransform: RequestTransformerRegistry;
};

/** アダプタの setup に渡す EditorApi を組み立てる */
export const createEditorApi = ({
	appVersion,
	document,
	loadProject,
	preview,
	styleHistory,
	sourceCatalog,
	saveProviders,
	newStyleHandlers,
	openRailItem,
	requestTransform
}: EditorApiDependencies): EditorApi => {
	const { style, icons, fonts, localDraft } = document;
	return {
		get appVersion() {
			return appVersion();
		},
		getStyle: () => style.mapStyle,
		setStyle: (next) => style.setMapStyle(next),
		loadProject,
		getSpriteIcons: () => $state.snapshot(icons.icons),
		replaceSpriteIcons: icons.replaceIcons,
		getStoredFonts: fonts.getStoredFonts,
		getFontMetadata: () => $state.snapshot(fonts.fonts),
		replaceStoredFonts: fonts.replaceStoredFonts,
		setPreview: preview.set,
		getPreview: preview.get,
		registerStyleHistoryProvider: (provider) => styleHistory.register(provider),
		registerSaveProvider: (provider) => saveProviders.push(provider),
		registerSourceCatalog: (catalog) => sourceCatalog.register(catalog),
		registerNewStyleHandler: (handler) => newStyleHandlers.push(handler),
		openRailItem,
		getDraftScope: () => localDraft.scope,
		openDraftScope: (scope) => localDraft.open(scope),
		onDraftOpened: localDraft.onOpened,
		getDraftMeta: () => $state.snapshot(localDraft.meta) as LocalDraftMeta,
		getDraftData: localDraft.getAdapterData,
		setDraftData: localDraft.setAdapterData,
		markSaved: localDraft.markSaved,
		listUnsavedDrafts: localDraft.listUnsavedDrafts,
		registerDraftInspector: localDraft.registerInspector,
		registerRequestTransformer: requestTransform.register,
		buildStyleAssets: document.buildStyleAssets,
		createStyleExport: document.createStyleExport
	};
};
