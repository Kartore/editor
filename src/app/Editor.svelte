<script lang="ts">
	import type { LayerSpecification, ResourceType, StyleSpecification } from 'maplibre-gl';
	import { onDestroy, onMount, setContext, tick, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	import { isExpression } from '#src/components/common/FilterInputField/expressions/utils/isExpression.ts';
	import { RowPopover } from '#src/components/common/RowPopover';
	import { DraftRecoveryDialog } from '#src/components/editor/DraftRecoveryDialog';
	import ExportStyleDialog from '#src/components/editor/ExportStyleDialog/ExportStyleDialog.svelte';
	import { ImportStyleDialog } from '#src/components/editor/ImportStyleDialog';
	import {
		InspectSession,
		type InspectedFeature,
		type InspectPointResult
	} from '#src/components/editor/InspectMode';
	import { LayerInspector, type LayerInspectorTab } from '#src/components/editor/LayerInspector';
	import { ExpressionPopoverPanel } from '#src/components/editor/PropertiesPanel/ExpressionPopoverPanel';
	import { provideLocalSpriteImages } from '#src/components/editor/PropertiesPanel/LayerPropertiesPanel/hooks/useSpriteIds/localSpriteImages.ts';
	import {
		replaceLayerData,
		type onChangeType
	} from '#src/components/editor/PropertiesPanel/LayerPropertiesPanel/utils/LayerUtil/LayerUtil.ts';
	import {
		CommandPalette,
		EmptyPropertiesDock,
		MapViewport,
		PropertiesDock,
		Rail,
		ResizableSidebar,
		SecondColumn,
		TopBar
	} from '#src/components/shell';
	import { ShellLayout } from '#src/components/shell/shellLayout.svelte.ts';
	import type { ShellMode } from '#src/components/shell/shellMode.ts';
	import {
		DEFAULT_PROPERTIES_PANEL_WIDTH,
		DEFAULT_SIDEBAR_WIDTH,
		MAX_PROPERTIES_PANEL_WIDTH,
		MAX_SIDEBAR_WIDTH,
		MIN_PROPERTIES_PANEL_WIDTH,
		MIN_SIDEBAR_WIDTH
	} from '#src/components/shell/sidebarSize.ts';
	import { provideBackgroundMap } from '#src/contexts/backgroundMap.svelte.ts';
	import { provideEditorCommands } from '#src/contexts/editorCommands.svelte.ts';
	import { provideExpressionFlyout } from '#src/contexts/expressionFlyout.svelte.ts';
	import { provideRequestTransform } from '#src/contexts/requestTransform.ts';
	import { provideSourceCatalog } from '#src/contexts/sourceCatalog.svelte.ts';
	import { provideStyleHistory } from '#src/contexts/styleHistory.svelte.ts';
	import { provideStyleVariables } from '#src/contexts/styleVariables.svelte.ts';
	import { createEditorApi } from '#src/editor/editorApi.svelte.ts';
	import { EditorDocument } from '#src/editor/editorDocument.svelte.ts';
	import type {
		EditorPreview,
		EditorProject,
		NewStyleHandler,
		SaveProvider
	} from '#src/editor/EditorModule.ts';
	import { collectEditorRailItems } from '#src/editor/editorRail.ts';
	import type { EditorStorage } from '#src/editor/localDraft/types.ts';
	import { createRequestTransformerRegistry } from '#src/editor/requestTransform.ts';
	import { dispatchSave } from '#src/editor/saveProvider.ts';
	import { registerGlyphProtocol } from '#src/fonts/glyphProtocol.ts';
	import { loadGlyphore } from '#src/fonts/glyphore.ts';
	import {
		MapSpriteSynchronizer,
		type LocalSpriteDimensions
	} from '#src/sprites/mapSpriteSynchronizer.ts';
	import { spriteDimensionsFromSvg, svgDataUrl } from '#src/sprites/spriteSvg.ts';
	import { COLOR_VISION_MODE_LABELS, type ColorVisionMode } from '#src/utils/colorVision.ts';
	import { downloadBlob } from '#src/utils/download.ts';
	import { duplicateLayer, insertLayer, removeLayer } from '#src/utils/layerEdit.ts';
	import { groupLayersByIdPrefix } from '#src/utils/layerGroup.ts';
	import { getLayerRawPropertyValue, type RootPropertyKind } from '#src/utils/layerSpec.ts';
	import { getPropertyInitialValue, type PropertyCatalogItem } from '#src/utils/propertyCatalog.ts';
	import { createEmptyStyle } from '#src/utils/styleCreate.ts';
	import {
		createStyleExports,
		styleExportArchiveFileName,
		type StyleExportKind
	} from '#src/utils/styleExport.ts';
	import { createStyleExportArchive } from '#src/utils/styleExportArchive.ts';
	import {
		replaceStyleRootData,
		replaceStyleSettingData,
		setStyleRootObject,
		type StyleSettingChange
	} from '#src/utils/styleRoot.ts';
	import { validateMapStyle, type StyleValidationResult } from '#src/utils/styleValidation.ts';
	import { normalizeStyleVariables } from '#src/utils/styleVariables.ts';

	import { adapterModules } from './adapters.ts';
	import { handleEditorShortcut } from './editorShortcuts.ts';

	// スタイル全体の JSON 表示は CodeMirror を使うので、開いたときに読み込む (最初の JS を小さくする)
	const loadStyleJsonPanel = () =>
		import('#src/components/editor/StyleJsonPanel/StyleJsonPanel.svelte');

	let {
		appVersion,
		storage,
		scope = null
	}: {
		appVersion: string;
		/**
		 * 手元の保存のしかた (保存先をスコープごとに作る関数一式)。省略時は今までと同じ保存先
		 * (localStorage の kartore:style / kartore:sprite-svgs と IndexedDB の kartore-fonts) を使う
		 */
		storage?: EditorStorage;
		/** 保存の単位。変えると保存先を切り替えて読み直す。null はスコープ無し */
		scope?: string | null;
	} = $props();

	// storage は作成時の値だけを使う (差し替えには対応しない)。scope の変更は下の $effect で追う
	const editorDocument = new EditorDocument({
		storage: untrack(() => storage),
		scope: untrack(() => scope)
	});
	const { localDraft, style: store, icons: spriteIconsStore, fonts: fontsStore } = editorDocument;
	const requestTransform = provideRequestTransform(createRequestTransformerRegistry());
	const shell = new ShellLayout();
	const adapterRailItems = collectEditorRailItems(adapterModules);

	const backgroundMap = provideBackgroundMap();
	provideEditorCommands();
	const expressionFlyout = provideExpressionFlyout();
	const styleHistory = provideStyleHistory();
	const sourceCatalog = provideSourceCatalog();
	const saveProviders: SaveProvider[] = [];
	const newStyleHandlers: NewStyleHandler[] = [];
	const localSpriteDimensions = new SvelteMap<string, LocalSpriteDimensions>();
	provideLocalSpriteImages(() =>
		Object.entries(spriteIconsStore.icons).map(([id, { svg, sdf }]) => {
			const fallback = spriteDimensionsFromSvg(svg);
			const rendered = localSpriteDimensions.get(id);
			const dimensions = rendered?.svg === svg ? rendered : fallback;
			return {
				id,
				src: svgDataUrl(svg, dimensions),
				x: 0,
				y: 0,
				width: dimensions.width,
				height: dimensions.height,
				pixelRatio: 1,
				...(sdf ? { sdf: true } : {})
			};
		})
	);
	type FlyoutPositionAnchor = {
		contextElement: HTMLElement;
		getBoundingClientRect: () => DOMRect;
	};

	let selectedLayerId = $state<string | null>(null);
	let activeShellMode = $state<ShellMode>('layers');
	let layerSelectionRequest = $state(0);
	let layerSearchInput = $state<HTMLInputElement | null>(null);
	let layerDragActive = $state(false);
	let importDialogOpen = $state(false);
	let exportDialogOpen = $state(false);
	let addLayerPopoverOpen = $state(false);
	let styleJsonMode = $state(false);
	let activeLayerTab = $state<LayerInspectorTab>('design');
	let commandPaletteOpen = $state(false);
	let previewState = $state<EditorPreview | null>(null);
	let paletteSelectionLabel = $state<string | null>(null);
	let colorVisionMode = $state<ColorVisionMode>('none');
	const activeAdapterRailItem = $derived(
		adapterRailItems.find((item) => item.mode === activeShellMode) ?? null
	);

	onMount(shell.restore);

	const openAdapterRailItem = (moduleId: string, railItemId: string) => {
		const item = adapterRailItems.find(
			(candidate) => candidate.moduleId === moduleId && candidate.id === railItemId
		);
		if (!item) return;
		expressionFlyout.close();
		activeShellMode = item.mode;
		styleJsonMode = false;
		if (shell.leftCollapsed) shell.setLeftCollapsed(false);
	};

	/** 左の列を切り替える (式のフライアウトは閉じない) */
	const showShellMode = (mode: ShellMode) => {
		activeShellMode = mode;
		styleJsonMode = false;
	};

	provideStyleVariables(store, () => previewState === null);
	const effectiveStyle = $derived(previewState?.style ?? store.mapStyle);
	const inspect = new InspectSession({
		backgroundMap,
		requestTransform,
		getStyle: () => effectiveStyle,
		getPreview: () => previewState,
		setPreview: (preview) => (previewState = preview),
		cancelTransientEdit: () => store.cancelStyleTransient()
	});
	const editorStyle = $derived(
		inspect.active && inspect.stylePreview ? inspect.stylePreview : effectiveStyle
	);

	registerGlyphProtocol({
		hasLocalFont: (fontstack) => fontstack in fontsStore.fonts,
		getOriginalGlyphsUrl: () => effectiveStyle.glyphs,
		generateRange: async (fontstack, start) => {
			const font = await fontsStore.getLoadedFont(fontstack);
			if (!font) throw new Error(`Local font “${fontstack}” is no longer available.`);
			const { generateRange } = await loadGlyphore();
			return generateRange(font, start);
		},
		// ResourceType は const enum なので値を参照できない。文字列値をそのまま渡す
		transformRequest: (url) => requestTransform.resolve(url, 'Glyphs' as ResourceType)
	});
	const selectedLayer = $derived<LayerSpecification | undefined>(
		editorStyle.layers.find((layer) => layer.id === selectedLayerId) ?? editorStyle.layers[0]
	);
	const effectiveSelectedLayerId = $derived(selectedLayer?.id ?? null);
	const flyoutPositionAnchor = $derived.by((): FlyoutPositionAnchor | null => {
		const propertyAnchor = expressionFlyout.anchor;
		if (!propertyAnchor) return null;
		const propertiesPanel = propertyAnchor.closest('[data-properties-panel]');
		if (!(propertiesPanel instanceof HTMLElement)) return null;

		return {
			// floating-ui がパネルのスクロール祖先を監視できるよう押下要素を紐付ける。
			contextElement: propertyAnchor,
			getBoundingClientRect: () => {
				const propertyRect = propertyAnchor.getBoundingClientRect();
				const panelRect = propertiesPanel.getBoundingClientRect();
				return new DOMRect(panelRect.left, propertyRect.top, 0, propertyRect.height);
			}
		};
	});

	const validation = $derived(
		validateMapStyle(
			$state.snapshot(editorStyle as object) as StyleSpecification
		) as StyleValidationResult
	);
	const spriteMapSynchronizer = new MapSpriteSynchronizer((dimensions) => {
		localSpriteDimensions.clear();
		for (const [id, value] of Object.entries(dimensions)) {
			localSpriteDimensions.set(id, value);
		}
	});
	const spriteSyncInput = $derived({
		map: backgroundMap.map,
		icons: spriteIconsStore.icons
	});
	$effect(() => {
		spriteMapSynchronizer.input = spriteSyncInput;
	});
	const loadProject = async (project: EditorProject): Promise<void> => {
		previewState = null;
		await editorDocument.loadProject(project);
	};

	const editorApi = createEditorApi({
		appVersion: () => appVersion,
		document: editorDocument,
		loadProject,
		preview: { get: () => previewState, set: (preview) => (previewState = preview) },
		styleHistory,
		sourceCatalog,
		saveProviders,
		newStyleHandlers,
		openRailItem: openAdapterRailItem,
		requestTransform
	});
	for (const module of adapterModules) {
		setContext(`module:${module.id}`, module.setup?.(editorApi));
	}

	onMount(() => {
		void editorDocument.initialize();
	});
	// scope prop が変わったら保存先を切り替える (最初の値は editorDocument.initialize が開く)
	$effect(() => {
		const nextScope = scope;
		untrack(() => {
			if (!editorDocument.initializing && nextScope !== localDraft.scope) {
				void localDraft.open(nextScope);
			}
		});
	});

	const handleChangeLayerOrder = (layers: LayerSpecification[]) => {
		if (previewState) return;
		store.setMapStyle((currentStyle) => ({ ...currentStyle, layers }));
	};

	const handleGroupLayersByPrefix = (): number => {
		if (previewState) return 0;
		const grouping = groupLayersByIdPrefix(store.mapStyle.layers);
		if (grouping.groupCount === 0) return 0;
		store.setMapStyle((currentStyle) => ({ ...currentStyle, layers: grouping.layers }));
		return grouping.groupCount;
	};

	const handleChangeLayerData: onChangeType = (layer, group, key, value) => {
		if (previewState) return;
		store.setMapStyle((currentStyle) => replaceLayerData(currentStyle, layer, group, key, value));
	};
	const handleChangeLayerDataTransient: onChangeType = (layer, group, key, value) => {
		if (previewState) return;
		store.setStyleTransient((currentStyle) =>
			replaceLayerData(currentStyle, layer, group, key, value)
		);
	};
	const handleCommitLayerData: onChangeType = (layer, group, key, value) => {
		if (previewState) return;
		store.commitStyle((currentStyle) => replaceLayerData(currentStyle, layer, group, key, value));
	};

	const handleChangeStyleRoot = (kind: RootPropertyKind, key: string, value: unknown) => {
		if (previewState) return;
		store.setMapStyle((currentStyle) => replaceStyleRootData(currentStyle, kind, key, value));
	};

	const handleChangeStyleSetting: StyleSettingChange = (key, value) => {
		if (previewState) return;
		if (JSON.stringify(store.mapStyle[key]) === JSON.stringify(value)) return;
		store.setMapStyle((currentStyle) => replaceStyleSettingData(currentStyle, key, value));
	};

	const handleSetStyleRootObject = (kind: RootPropertyKind, value: object | undefined) => {
		if (previewState) return;
		store.setMapStyle((currentStyle) => setStyleRootObject(currentStyle, kind, value));
	};

	const handleImport = (style: StyleSpecification) => {
		if (previewState) return;
		store.setMapStyle(normalizeStyleVariables(style));
	};

	const handleNewStyle = () => {
		inspect.end();
		previewState = null;
		store.cancelStyleTransient();
		expressionFlyout.close();
		for (const handler of newStyleHandlers) handler();
		backgroundMap.filterHighlight = null;
		paletteSelectionLabel = null;
		activeShellMode = 'layers';
		styleJsonMode = false;
		addLayerPopoverOpen = false;
		selectedLayerId = null;
		store.setMapStyle(createEmptyStyle());
	};

	const handleApplyStyle = (style: StyleSpecification) => {
		if (previewState) return;
		store.setMapStyle(style);
	};

	const handleShowWholeStyleJson = () => {
		expressionFlyout.close();
		activeShellMode = 'settings';
		styleJsonMode = true;
	};

	const handleToggleStyleJson = () => {
		if (styleJsonMode) {
			styleJsonMode = false;
			return;
		}
		handleShowWholeStyleJson();
	};

	const handleApplyStyleJson = (style: StyleSpecification) => {
		if (previewState) return;
		store.setMapStyle(style);
	};

	const handleExport = async (kind: StyleExportKind, includeAssets = false): Promise<void> => {
		const style = editorDocument.snapshotStyle();
		if (includeAssets) {
			const archive = await createStyleExportArchive(style, kind, editorDocument.exportAssets());
			downloadBlob(archive, 'application/zip', styleExportArchiveFileName(style, kind));
			return;
		}

		for (const styleExport of createStyleExports(style, kind)) {
			downloadBlob(styleExport.contents, 'application/json', styleExport.fileName);
		}
	};

	const handleSave = () => {
		// SaveProvider.save が true で終わったら保存済みにする (書き出しのフォールバックは保存済みにしない)
		void Promise.resolve(dispatchSave(saveProviders, () => handleExport('current-mode'))).then(
			(result) => {
				if (result === true) void localDraft.markSaved();
			}
		);
	};

	const handleRenameStyle = (name: string) => {
		if (previewState || name.trim() === '' || name === (store.mapStyle.name ?? '')) return;
		store.setMapStyle((currentStyle) => ({ ...currentStyle, name }));
	};

	const handleSelectLayer = (layer: LayerSpecification) => {
		expressionFlyout.close();
		styleJsonMode = false;
		selectedLayerId = layer.id;
		layerSelectionRequest += 1;
	};

	const handleInspectSelectLayer = (feature: InspectedFeature) => {
		const layer = inspect.layerForFeature(feature);
		if (!layer) return;
		showShellMode('layers');
		handleSelectLayer(layer);
	};
	const handleInspectFilterProperty = (
		feature: InspectedFeature,
		key: string,
		value: string | number | boolean
	) => {
		const layer = inspect.layerForFeature(feature);
		if (!layer || layer.type === 'background' || !inspect.stylePreview) return;
		if (inspect.view === 'data') inspect.setView('style');
		handleInspectSelectLayer(feature);
		activeLayerTab = 'filter';
		inspect.addFeatureFilter(layer, key, value);
	};

	const handleToggleLayerVisibility = (layer: LayerSpecification, visible: boolean) => {
		handleChangeLayerData(layer, 'layout', 'visibility', visible ? 'visible' : 'none');
	};

	const handleShowLayers = () => {
		expressionFlyout.close();
		showShellMode('layers');
	};

	const handleShowStyleSettings = () => {
		expressionFlyout.close();
		showShellMode('settings');
	};

	const handleShowPalette = () => {
		expressionFlyout.close();
		showShellMode('palette');
	};

	const handleOpenAddLayer = () => {
		expressionFlyout.close();
		activeShellMode = 'layers';
		styleJsonMode = false;
		if (shell.leftCollapsed) shell.setLeftCollapsed(false);
		addLayerPopoverOpen = true;
	};

	const handleApplyLayer = (nextLayer: LayerSpecification, previousId: string) => {
		if (previewState) return;
		if (
			nextLayer.id !== previousId &&
			store.mapStyle.layers.some((layer) => layer.id === nextLayer.id)
		) {
			return;
		}
		store.setMapStyle((currentStyle) => ({
			...currentStyle,
			layers: currentStyle.layers.map((layer) => (layer.id === previousId ? nextLayer : layer))
		}));
		selectedLayerId = nextLayer.id;
	};

	const handleCommandSelectProperty = async (item: PropertyCatalogItem) => {
		if (!selectedLayer) return;
		expressionFlyout.close();
		activeShellMode = 'layers';
		styleJsonMode = false;
		activeLayerTab = 'design';
		if (getLayerRawPropertyValue(selectedLayer, item.group, item.key) === undefined) {
			handleChangeLayerData(
				selectedLayer,
				item.group,
				item.key as never,
				getPropertyInitialValue(item) as never
			);
		}
		await tick();
		await tick();
		const row = document.querySelector<HTMLElement>(
			`[data-property-row="${CSS.escape(`${item.group}:${item.key}`)}"]`
		);
		row?.scrollIntoView({ block: 'nearest' });
		row?.querySelector<HTMLElement>('input, button, [tabindex]')?.focus();
	};

	const handleAddLayer = (layer: LayerSpecification, aboveLayerId?: string) => {
		expressionFlyout.close();
		activeShellMode = 'layers';
		if (previewState) return;
		store.setMapStyle((currentStyle) => insertLayer(currentStyle, layer, aboveLayerId));
		selectedLayerId = layer.id;
	};

	const handleDuplicateLayer = () => {
		if (previewState || !selectedLayer) return;
		expressionFlyout.close();
		store.setMapStyle((currentStyle) => {
			const result = duplicateLayer(currentStyle, selectedLayer.id);
			if (!result) return currentStyle;
			selectedLayerId = result.layerId;
			return result.style;
		});
	};

	const handleDeleteLayer = () => {
		if (previewState || selectedLayerId === null) return;
		expressionFlyout.close();
		store.setMapStyle((currentStyle) => {
			const result = removeLayer(currentStyle, selectedLayerId!);
			if (!result) return currentStyle;
			selectedLayerId = result.nextSelectedId;
			return result.style;
		});
	};

	const handleUseCurrentView = () => {
		if (previewState) return;
		const map = backgroundMap.map;
		const center = map?.getCenter();
		store.setMapStyle((currentStyle) => ({
			...currentStyle,
			center: center ? [center.lng, center.lat] : [backgroundMap.longitude, backgroundMap.latitude],
			zoom: map?.getZoom() ?? backgroundMap.zoom ?? currentStyle.zoom,
			bearing: map?.getBearing() ?? backgroundMap.bearing,
			pitch: map?.getPitch() ?? backgroundMap.pitch
		}));
	};

	const handleRevertStyle = (style: StyleSpecification) => {
		previewState = null;
		store.setMapStyle(style);
	};

	const handleKeyDown = (event: KeyboardEvent) =>
		handleEditorShortcut(
			event,
			{
				colorVisionActive: colorVisionMode !== 'none',
				inspectActive: inspect.active,
				blocked: importDialogOpen || exportDialogOpen || addLayerPopoverOpen || layerDragActive,
				activeShellMode,
				historyAvailable: styleHistory.provider?.available ?? false,
				leftShellCollapsed: shell.leftCollapsed
			},
			{
				newStyle: handleNewStyle,
				save: handleSave,
				openCommandPalette: () => (commandPaletteOpen = true),
				exitColorVision: () => (colorVisionMode = 'none'),
				endInspect: inspect.end,
				toggleInspect: inspect.toggle,
				showMode: (mode) => {
					expressionFlyout.close();
					showShellMode(mode);
				},
				setLeftShellCollapsed: shell.setLeftCollapsed,
				deleteLayer: handleDeleteLayer,
				undo: () => store.undo(),
				redo: () => store.redo()
			}
		);

	// 対象プロパティが expression でなくなったら (Reset された等) フライアウトは意味を失う
	const flyoutValue = $derived.by(() => {
		const target = expressionFlyout.target;
		if (!target || !selectedLayer) return undefined;
		if (target.group === 'filter') {
			return 'filter' in selectedLayer ? selectedLayer.filter : undefined;
		}
		return (
			selectedLayer[target.group as keyof LayerSpecification] as Record<string, unknown> | undefined
		)?.[target.key];
	});
	const flyoutVisible = $derived.by(() => {
		const target = expressionFlyout.target;
		if (target === null) return false;
		if (target.group === 'filter') {
			return flyoutValue !== undefined;
		}
		return isExpression(flyoutValue);
	});

	// 保存は 500ms デバウンスされるため、アンマウント時に予約中の保存を書き出す
	onDestroy(inspect.end);
	onDestroy(spriteMapSynchronizer.destroy);
	onDestroy(editorDocument.destroy);

	// 予約中の保存を書き出し、保存していない編集があれば閉じる前に確かめる (確認はストレージが求めるときだけ)
	const handleBeforeUnload = (event: BeforeUnloadEvent) => {
		editorDocument.flush();
		if (editorDocument.shouldConfirmUnload) {
			event.preventDefault();
			event.returnValue = '';
		}
	};
</script>

<svelte:head>
	<title>Kartore</title>
</svelte:head>

<!-- pagehide: モバイル Safari 等では beforeunload が発火しないため両方で flush する -->
<svelte:window
	onkeydown={handleKeyDown}
	onbeforeunload={handleBeforeUnload}
	onpagehide={editorDocument.flush}
/>

<DraftRecoveryDialog
	prompt={localDraft.recovery}
	onRestore={() => localDraft.resolveRecovery('restore')}
	onDiscard={() => localDraft.resolveRecovery('discard')}
/>

{#if editorDocument.loading}
	<div class="flex min-h-screen items-center justify-center text-[11px] text-ink-2">
		Loading map style…
	</div>
{:else if editorDocument.initializeError}
	<div
		class="flex min-h-screen items-center justify-center bg-canvas px-6 text-center"
		role="alert"
	>
		<div class="max-w-md">
			<p class="text-sm font-semibold text-ink-1">Could not load the initial project</p>
			<p class="mt-2 text-[11px] text-ink-2">{editorDocument.initializeError.message}</p>
		</div>
	</div>
{:else}
	<div class="flex h-screen w-full flex-col overflow-hidden bg-canvas">
		<TopBar
			mapStyle={editorStyle}
			{adapterModules}
			saveState={store.saveError ? 'error' : store.isSaving ? 'saving' : 'saved'}
			canUndo={!previewState && store.canUndo}
			canRedo={!previewState && store.canRedo}
			onUndo={() => store.undo()}
			onRedo={() => store.redo()}
			onNewStyle={handleNewStyle}
			onImport={() => (importDialogOpen = true)}
			onExport={() => (exportDialogOpen = true)}
			onRenameStyle={previewState ? undefined : handleRenameStyle}
			onAddLayer={handleOpenAddLayer}
			onGroupLayersByPrefix={previewState ? undefined : handleGroupLayersByPrefix}
			onOpenStyleSettings={handleShowStyleSettings}
			{styleJsonMode}
			onToggleStyleJson={handleToggleStyleJson}
			onOpenVariables={handleShowPalette}
			onOpenSources={() => showShellMode('sources')}
			onOpenSprites={() => showShellMode('sprites')}
			onOpenFonts={() => showShellMode('fonts')}
			{colorVisionMode}
			onColorVisionModeChange={(mode) => (colorVisionMode = mode)}
			leftShellCollapsed={shell.leftCollapsed}
			onTogglePanels={() => shell.setLeftCollapsed(!shell.leftCollapsed)}
			onSearch={() => (commandPaletteOpen = true)}
		/>

		<div class="flex min-h-0 flex-1">
			{#if !shell.leftCollapsed}
				<Rail
					activeMode={activeShellMode}
					historyAvailable={styleHistory.provider?.available ?? false}
					railItems={adapterRailItems}
					onLayers={handleShowLayers}
					onPalette={handleShowPalette}
					onSources={() => showShellMode('sources')}
					onSprites={() => showShellMode('sprites')}
					onFonts={() => showShellMode('fonts')}
					onHistory={styleHistory.provider ? () => showShellMode('history') : undefined}
					onRailItem={(item) => openAdapterRailItem(item.moduleId, item.id)}
					onSettings={handleShowStyleSettings}
				/>
				<ResizableSidebar
					bind:width={shell.sidebarWidth}
					minWidth={MIN_SIDEBAR_WIDTH}
					maxWidth={MAX_SIDEBAR_WIDTH}
					defaultWidth={DEFAULT_SIDEBAR_WIDTH}
					label="Resize left sidebar"
					onResizeEnd={shell.finishSidebarResize}
				>
					<SecondColumn
						activeMode={activeShellMode}
						moduleRailItem={activeAdapterRailItem}
						mapStyle={editorStyle}
						selectedLayerId={effectiveSelectedLayerId}
						layerErrors={validation.layerErrors}
						styleErrors={validation.styleErrors}
						readOnly={previewState !== null}
						spriteIcons={spriteIconsStore.icons}
						fonts={fontsStore.fonts}
						historyProvider={styleHistory.provider}
						bind:addLayerOpen={addLayerPopoverOpen}
						onClickLayer={handleSelectLayer}
						onChangeLayerOrder={handleChangeLayerOrder}
						onAddLayer={handleAddLayer}
						onToggleLayerVisibility={handleToggleLayerVisibility}
						bind:layerSearchInput
						onLayerDragActiveChange={(active) => (layerDragActive = active)}
						onApplyStyle={handleApplyStyle}
						onSetSpriteIcon={spriteIconsStore.setIcon}
						onRemoveSpriteIcon={spriteIconsStore.removeIcon}
						onAddFont={fontsStore.addFont}
						onRemoveFont={fontsStore.removeFont}
						getLoadedFont={fontsStore.getLoadedFont}
						getStoredFonts={fontsStore.getStoredFonts}
						onSetPreview={(preview) => (previewState = preview)}
						onRevertStyle={handleRevertStyle}
						onChangeStyleSetting={handleChangeStyleSetting}
						onChangeRoot={handleChangeStyleRoot}
						onSetRootObject={handleSetStyleRootObject}
						onOpenStyleJson={handleShowWholeStyleJson}
						onUseCurrentView={handleUseCurrentView}
						onPaletteSelectionChange={(label) => (paletteSelectionLabel = label)}
						onOpenPalette={handleShowPalette}
					/>
				</ResizableSidebar>
			{/if}

			<MapViewport
				mapStyle={effectiveStyle}
				hasLocalFonts={Object.keys(fontsStore.fonts).length > 0}
				onClickLayer={handleSelectLayer}
				inspectActive={inspect.active}
				inspectSession={inspect.session}
				inspectView={inspect.view}
				inspectLegend={inspect.legend}
				inspectHiddenDataKeys={inspect.hiddenDataKeys}
				inspectHover={inspect.hover}
				inspectPopup={inspect.popup}
				inspectSelectedIndex={inspect.selectedIndex}
				inspectHighlight={inspect.highlight}
				inspectTileBoundaries={inspect.tileBoundaries}
				inspectSourceMetadata={inspect.sourceMetadata}
				{colorVisionMode}
				onToggleInspect={inspect.toggle}
				onInspectViewChange={inspect.setView}
				onInspectLegendToggle={inspect.toggleLegendEntry}
				onInspectHover={(result) => (inspect.hover = result)}
				onInspectClick={(result: InspectPointResult) => inspect.showPopup(result)}
				onInspectSelectFeature={inspect.selectFeature}
				onInspectHighlightFeature={(feature) => (inspect.popoverHighlight = feature)}
				onInspectFilterProperty={handleInspectFilterProperty}
				onInspectSelectLayer={handleInspectSelectLayer}
				onInspectTileBoundariesChange={inspect.setTileBoundaries}
				onInspectClosePopup={inspect.closePopup}
			>
				{#if shell.leftCollapsed}
					<button
						type="button"
						class="absolute top-3 left-3 z-20 h-7 cursor-pointer rounded-[6px] bg-white px-2.5 text-[10.5px] font-semibold text-ink-2 shadow-[0_1px_4px_rgba(0,0,0,0.16)] hover:bg-field"
						onclick={() => shell.setLeftCollapsed(false)}
					>
						Panels <span class="font-mono text-ink-3">⌘.</span>
					</button>
				{/if}
				{#if colorVisionMode !== 'none'}
					<div
						class="absolute top-3 left-1/2 z-20 flex h-7 -translate-x-1/2 items-center gap-2.5 rounded-[6px] bg-ink-1 px-3 text-[10.5px] text-white shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
					>
						<span>
							{colorVisionMode === 'grayscale'
								? 'Grayscale simulation active'
								: `${COLOR_VISION_MODE_LABELS[colorVisionMode]} simulation active`}
						</span>
						<span class="text-[9.5px] text-ink-3">esc to exit</span>
					</div>
				{:else if previewState && !inspect.active}
					<div
						class="absolute top-3 left-1/2 z-20 flex h-7 -translate-x-1/2 items-center gap-3 rounded-[6px] border border-accent bg-accent-soft px-3 text-[11px] font-semibold text-accent"
					>
						<span>Previewing {previewState.label}. Editing is disabled.</span>
						<button
							type="button"
							class="h-5 cursor-pointer rounded-[5px] px-1.5 hover:bg-white"
							onclick={() => (previewState = null)}
						>
							Exit
						</button>
					</div>
				{:else if paletteSelectionLabel}
					<div
						class="absolute top-3 left-1/2 z-20 flex h-7 -translate-x-1/2 items-center rounded-[6px] border border-accent bg-accent-soft px-3 text-[11px] font-semibold text-accent"
					>
						Highlighting usages of {paletteSelectionLabel}
					</div>
				{/if}
			</MapViewport>

			<ResizableSidebar
				bind:width={shell.propertiesPanelWidth}
				minWidth={MIN_PROPERTIES_PANEL_WIDTH}
				maxWidth={MAX_PROPERTIES_PANEL_WIDTH}
				defaultWidth={DEFAULT_PROPERTIES_PANEL_WIDTH}
				resizeEdge="left"
				label="Resize properties panel"
				onResizeEnd={shell.finishPropertiesPanelResize}
			>
				<PropertiesDock>
					{#if styleJsonMode}
						{#await loadStyleJsonPanel() then { default: StyleJsonPanel }}
							<StyleJsonPanel
								class="h-full w-full min-w-0 rounded-none border-0 shadow-none"
								mapStyle={editorStyle}
								selectedLayerId={effectiveSelectedLayerId}
								{layerSelectionRequest}
								readOnly={previewState !== null}
								onApply={handleApplyStyleJson}
							/>
						{/await}
					{:else if selectedLayer}
						{#key selectedLayer.id}
							<LayerInspector
								class="h-full w-full min-w-0 rounded-none border-0 shadow-none"
								bind:activeTab={activeLayerTab}
								mapStyle={editorStyle}
								sprite={editorStyle.sprite}
								layer={selectedLayer}
								fontNames={Object.keys(fontsStore.fonts)}
								sources={editorStyle.sources}
								errors={validation.layerErrors[selectedLayer.id]}
								readOnly={previewState !== null}
								onChange={handleChangeLayerData}
								onTransientChange={handleChangeLayerDataTransient}
								onCommitChange={handleCommitLayerData}
								onCancelTransient={store.cancelStyleTransient}
								onApplyLayer={handleApplyLayer}
								onDuplicateLayer={handleDuplicateLayer}
								onDeleteLayer={handleDeleteLayer}
								canDeleteLayer={!previewState}
							/>
						{/key}
					{:else}
						<EmptyPropertiesDock onAddLayer={handleOpenAddLayer} />
					{/if}
				</PropertiesDock>
			</ResizableSidebar>
		</div>

		{#if !styleJsonMode && selectedLayer && flyoutVisible && expressionFlyout.target && flyoutPositionAnchor}
			<RowPopover
				open={true}
				customAnchor={flyoutPositionAnchor}
				contentClass="w-[320px]"
				onOpenChange={(open) => {
					if (!open) expressionFlyout.close();
				}}
			>
				<ExpressionPopoverPanel
					layer={selectedLayer}
					sprite={editorStyle.sprite}
					target={expressionFlyout.target!}
					errors={validation.layerErrors[selectedLayer.id]}
					onChange={handleChangeLayerData}
					onRequestJson={() => {
						expressionFlyout.close();
						activeLayerTab = 'json';
					}}
					onClose={() => expressionFlyout.close()}
				/>
			</RowPopover>
		{/if}

		<CommandPalette
			bind:open={commandPaletteOpen}
			layers={editorStyle.layers}
			{selectedLayer}
			onSelectLayer={(layerId) => {
				const layer = editorStyle.layers.find((candidate) => candidate.id === layerId);
				if (layer) handleSelectLayer(layer);
			}}
			onSelectProperty={handleCommandSelectProperty}
			onMoveZoom={(zoom) => backgroundMap.map?.easeTo({ zoom })}
			onMoveCoordinate={(longitude, latitude) =>
				backgroundMap.map?.easeTo({ center: [longitude, latitude] })}
		/>

		<ImportStyleDialog bind:open={importDialogOpen} onImport={handleImport} />
		<ExportStyleDialog
			bind:open={exportDialogOpen}
			style={store.mapStyle}
			spriteCount={Object.keys(spriteIconsStore.icons).length}
			fontCount={Object.keys(fontsStore.fonts).length}
			onExport={handleExport}
		/>
		{#each adapterModules as module (module.id)}
			{#each module.overlays ?? [] as Overlay, index (`${module.id}-${index}`)}
				<Overlay />
			{/each}
		{/each}
	</div>
{/if}
