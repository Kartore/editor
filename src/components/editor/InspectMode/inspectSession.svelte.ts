import type { LayerSpecification, ResourceType, StyleSpecification } from 'maplibre-gl';
import { SvelteSet } from 'svelte/reactivity';

import {
	isFilterBuilderSupported,
	parseFilter,
	serializeFilter
} from '#src/components/common/FilterQueryBuilder';
import type { BackgroundMapContext } from '#src/contexts/backgroundMap.svelte.ts';
import type { EditorPreview } from '#src/editor/EditorModule.ts';
import type { RequestTransformerRegistry } from '#src/editor/requestTransform.ts';

import {
	collectInspectSourceLayers,
	createInspectDataStyle,
	type InspectedFeature,
	type InspectHoverResult,
	type InspectLegendEntry,
	type InspectPointResult,
	type InspectSourceMetadata,
	type InspectView
} from './inspectUtils.ts';

export type InspectSessionDependencies = {
	backgroundMap: BackgroundMapContext;
	requestTransform: Pick<RequestTransformerRegistry, 'resolve'>;
	/** Inspect を始めた時点で見えているスタイル (プレビュー中ならプレビュー) */
	getStyle: () => StyleSpecification;
	getPreview: () => EditorPreview | null;
	setPreview: (preview: EditorPreview | null) => void;
	/** 確定前の一時的な編集を捨てる */
	cancelTransientEdit: () => void;
};

const POINT_INSPECTION = 'Point inspection';

const absoluteTileTemplate = (template: string, tileJsonUrl: string): string => {
	try {
		return new URL(template, tileJsonUrl).href.replaceAll('%7B', '{').replaceAll('%7D', '}');
	} catch {
		return template;
	}
};

/**
 * Inspect モード (地図上の地物を調べる) の状態。
 * 開始時のスタイルを複製してプレビューに出し、終了時にプレビュー・フィルタ強調・タイル境界を元に戻す
 */
export class InspectSession {
	active = $state(false);
	/** 開始・終了のたびに増える (地図側の一時状態のリセットに使う) */
	session = $state(0);
	view = $state<InspectView>('style');
	legend = $state.raw<InspectLegendEntry[]>([]);
	hiddenDataKeys = $state.raw<ReadonlySet<string>>(new SvelteSet());
	hover = $state.raw<InspectHoverResult | null>(null);
	popup = $state.raw<InspectPointResult | null>(null);
	selectedIndex = $state(0);
	popoverHighlight = $state.raw<InspectedFeature | null>(null);
	tileBoundaries = $state(false);
	sourceMetadata = $state.raw<Record<string, InspectSourceMetadata | undefined>>({});
	/** Inspect 中に表示しているスタイル (フィルタの試し適用を含む) */
	stylePreview = $state.raw<StyleSpecification | null>(null);

	/** 地図上で強調する地物: ポップオーバーで指したもの → クリックで選んだもの → ホバー中のもの */
	readonly highlight = $derived(
		this.popoverHighlight ??
			(this.popup
				? (this.popup.features[this.selectedIndex] ?? this.popup.features[0] ?? null)
				: (this.hover?.feature ?? null))
	);

	#deps: InspectSessionDependencies;
	#previousPreview: EditorPreview | null = null;
	#previousFilterHighlight: BackgroundMapContext['filterHighlight'] = null;
	#previousTileBoundaries = false;
	#metadataGeneration = 0;

	constructor(deps: InspectSessionDependencies) {
		this.#deps = deps;
	}

	begin = () => {
		if (this.active) return;
		const { backgroundMap } = this.#deps;
		this.#deps.cancelTransientEdit();
		this.#previousPreview = this.#deps.getPreview();
		this.#previousFilterHighlight = backgroundMap.filterHighlight;
		backgroundMap.filterHighlight = null;
		this.#previousTileBoundaries = backgroundMap.map?.showTileBoundaries ?? false;
		this.tileBoundaries = this.#previousTileBoundaries;
		this.stylePreview = structuredClone(
			$state.snapshot(this.#deps.getStyle() as object) as StyleSpecification
		);
		this.#deps.setPreview({ label: POINT_INSPECTION, style: this.stylePreview });
		this.active = true;
		this.session += 1;
		this.#resetTransientState();
		this.#metadataGeneration += 1;
		void this.#loadSourceMetadata(this.stylePreview, this.#metadataGeneration);
	};

	end = () => {
		if (!this.active) return;
		const { backgroundMap } = this.#deps;
		this.#metadataGeneration += 1;
		this.active = false;
		this.session += 1;
		this.#resetTransientState();
		backgroundMap.filterHighlight = this.#previousFilterHighlight;
		if (backgroundMap.map) {
			backgroundMap.map.showTileBoundaries = this.#previousTileBoundaries;
		}
		this.tileBoundaries = this.#previousTileBoundaries;
		this.#deps.setPreview(this.#previousPreview);
		this.stylePreview = null;
		this.#previousPreview = null;
	};

	toggle = () => {
		if (this.active) this.end();
		else this.begin();
	};

	setView = (view: InspectView) => {
		if (!this.active || !this.stylePreview || this.view === view) return;
		this.view = view;
		this.hover = null;
		this.popup = null;
		this.popoverHighlight = null;
		if (view === 'data') this.#refreshDataView();
		else this.#deps.setPreview({ label: POINT_INSPECTION, style: this.stylePreview });
	};

	toggleLegendEntry = (key: string) => {
		const next = new SvelteSet(this.hiddenDataKeys);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		this.hiddenDataKeys = next;
		if (this.view === 'data') this.#refreshDataView();
	};

	/** 地図をクリックして地物を拾った */
	showPopup = (result: InspectPointResult) => {
		this.popup = result;
		this.selectedIndex = 0;
		this.hover = null;
		this.popoverHighlight = null;
	};

	selectFeature = (index: number) => {
		this.selectedIndex = index;
		this.popoverHighlight = null;
	};

	closePopup = () => {
		this.popup = null;
		this.popoverHighlight = null;
	};

	setTileBoundaries = (visible: boolean) => {
		this.tileBoundaries = visible;
		const { map } = this.#deps.backgroundMap;
		if (map) map.showTileBoundaries = visible;
	};

	/** 地物を描いたレイヤー。id が一致しなければ、同じソース (・ソースレイヤー) を使う一番上のレイヤー */
	layerForFeature = (feature: InspectedFeature): LayerSpecification | undefined => {
		const style = this.stylePreview;
		if (!style) return undefined;
		const exact = style.layers.find(({ id }) => id === feature.layerId);
		if (exact) return exact;
		return [...style.layers]
			.reverse()
			.find(
				(layer) =>
					'source' in layer &&
					layer.source === feature.sourceId &&
					(feature.sourceLayer === undefined ||
						('source-layer' in layer && layer['source-layer'] === feature.sourceLayer))
			);
	};

	/** プレビュー上のレイヤーのフィルタに `key == value` を足して試す (元のスタイルは変えない) */
	addFeatureFilter = (layer: LayerSpecification, key: string, value: string | number | boolean) => {
		if (!this.stylePreview) return;
		const tree = parseFilter('filter' in layer ? layer.filter : undefined);
		if (!isFilterBuilderSupported(tree)) return;
		const filter = serializeFilter({
			...tree,
			children: [
				...tree.children,
				{
					kind: 'comparison' as const,
					op: '==' as const,
					subject: { kind: 'property' as const, key },
					value
				}
			]
		});
		this.stylePreview = {
			...this.stylePreview,
			layers: this.stylePreview.layers.map((currentLayer) =>
				currentLayer.id === layer.id
					? ({ ...currentLayer, filter } as LayerSpecification)
					: currentLayer
			)
		};
		this.#deps.setPreview({ label: POINT_INSPECTION, style: this.stylePreview });
		this.popup = null;
		this.popoverHighlight = null;
	};

	#resetTransientState() {
		this.view = 'style';
		this.legend = [];
		this.hiddenDataKeys = new SvelteSet();
		this.hover = null;
		this.popup = null;
		this.selectedIndex = 0;
		this.popoverHighlight = null;
		this.sourceMetadata = {};
	}

	#refreshDataView() {
		if (!this.active || !this.stylePreview) return;
		const sourceLayers = collectInspectSourceLayers(this.stylePreview, this.sourceMetadata);
		const generated = createInspectDataStyle(this.stylePreview, sourceLayers, this.hiddenDataKeys);
		this.legend = generated.legend;
		this.#deps.setPreview({ label: 'Data view', style: generated.style });
	}

	async #loadSourceMetadata(style: StyleSpecification, generation: number): Promise<void> {
		const entries = await Promise.all(
			Object.entries(style.sources).map(async ([sourceId, source]) => {
				const sourceRecord = source as unknown as Record<string, unknown>;
				const direct: InspectSourceMetadata = {
					tiles: Array.isArray(sourceRecord.tiles)
						? sourceRecord.tiles.filter((tile): tile is string => typeof tile === 'string')
						: undefined,
					minzoom: typeof sourceRecord.minzoom === 'number' ? sourceRecord.minzoom : undefined,
					maxzoom: typeof sourceRecord.maxzoom === 'number' ? sourceRecord.maxzoom : undefined
				};
				if (typeof sourceRecord.url !== 'string') return [sourceId, direct] as const;

				try {
					// アダプタの書き換え (cloudmap:// 等) を当ててから http(s) だけを取りに行く
					// (ResourceType は const enum なので文字列値で渡す)
					// 一時的な URL の組み立てなのでリアクティブにしない
					// eslint-disable-next-line svelte/prefer-svelte-reactivity
					const sourceUrl = new URL(sourceRecord.url, document.baseURI).href;
					const transformed = await this.#deps.requestTransform.resolve(
						sourceUrl,
						'Source' as ResourceType
					);
					if (!/^https?:/i.test(transformed.url)) return [sourceId, direct] as const;
					const tileJsonUrl = transformed.url;
					const response = await fetch(tileJsonUrl, {
						headers: transformed.headers,
						credentials: transformed.credentials
					});
					if (!response.ok) return [sourceId, direct] as const;
					const tileJson = (await response.json()) as InspectSourceMetadata;
					return [
						sourceId,
						{
							...direct,
							...tileJson,
							tiles: (tileJson.tiles ?? direct.tiles)?.map((template) =>
								absoluteTileTemplate(template, tileJsonUrl)
							),
							vector_layers: tileJson.vector_layers?.filter((layer) => typeof layer.id === 'string')
						}
					] as const;
				} catch {
					return [sourceId, direct] as const;
				}
			})
		);
		if (!this.active || generation !== this.#metadataGeneration) return;
		this.sourceMetadata = Object.fromEntries(entries);
		if (this.view === 'data') this.#refreshDataView();
	}
}
