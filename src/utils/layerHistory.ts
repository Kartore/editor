import type { LayerSpecification } from 'maplibre-gl';

import type { StyleHistoryProvider, StyleHistoryRevision } from '#src/editor/EditorModule.ts';

export type LayerRevisionValue = {
	revision: StyleHistoryRevision;
	/** layer が存在しない revision は layer-missing、読込失敗は error */
	state: 'value' | 'layer-missing' | 'error';
	/** state=value のとき */
	layer?: LayerSpecification;
	error?: string;
};

export type LayerHistoryEntry = {
	revision: StyleHistoryRevision;
	/** その revision のレイヤー (kind=layer-missing / error では無い) */
	layer?: LayerSpecification;
	/** ひとつ古い revision から変わったところ (`paint.line-color`、`filter` など) */
	changes: string[];
	/**
	 * changed: ひとつ古い revision から変わった / created: この revision でできた /
	 * oldest-loaded: 読み込んだ中で一番古い (より古い revision は未読込) /
	 * layer-missing: この revision にはまだ無い / error: 読めなかった
	 */
	kind: 'changed' | 'created' | 'oldest-loaded' | 'layer-missing' | 'error';
	error?: string;
};

const errorMessage = (value: unknown): string =>
	value instanceof Error ? value.message : value ? String(value) : 'Could not load history.';

/**
 * provider がレイヤー単位の読込に対応する場合はそれを使い、単一形式 provider では
 * style 全文からレイヤーを取り出す。
 */
export const loadLayerRevisionValue = async (
	provider: StyleHistoryProvider,
	revision: StyleHistoryRevision,
	layerId: string
): Promise<LayerRevisionValue> => {
	try {
		const layer = provider.loadLayerAtRevision
			? await provider.loadLayerAtRevision(revision.id, layerId)
			: ((await provider.loadStyleAtRevision(revision.id)).layers.find(
					(candidate) => candidate.id === layerId
				) ?? null);
		return layer === null
			? { revision, state: 'layer-missing' }
			: { revision, state: 'value', layer };
	} catch (error) {
		return { revision, state: 'error', error: errorMessage(error) };
	}
};

const same = (left: unknown, right: unknown): boolean =>
	JSON.stringify(left) === JSON.stringify(right);

/** paint と layout はプロパティごと、それ以外はキーごとに、2 つのレイヤーで違うところ */
export const layerChanges = (newer: LayerSpecification, older: LayerSpecification): string[] => {
	const changes: string[] = [];
	const record = (layer: LayerSpecification) => layer as unknown as Record<string, unknown>;
	const keys = new Set([...Object.keys(newer), ...Object.keys(older)]);
	for (const key of keys) {
		if (key === 'paint' || key === 'layout') {
			const left = (record(newer)[key] ?? {}) as Record<string, unknown>;
			const right = (record(older)[key] ?? {}) as Record<string, unknown>;
			for (const property of new Set([...Object.keys(left), ...Object.keys(right)])) {
				if (!same(left[property], right[property])) changes.push(`${key}.${property}`);
			}
		} else if (!same(record(newer)[key], record(older)[key])) {
			changes.push(key);
		}
	}
	return changes.sort();
};

/**
 * 新しい順のリビジョンのレイヤーから、実際にレイヤーが変わった revision だけを取り出す
 * (レイヤーで絞れない provider は全部の revision を返すので、変わっていないものは省く)。
 * error は比較から除外しつつ行として残し、layer-missing で探索を打ち切る。
 */
export const computeLayerHistoryEntries = (
	values: LayerRevisionValue[],
	hasNext: boolean
): LayerHistoryEntry[] => {
	const entries: Array<{ index: number; entry: LayerHistoryEntry }> = [];
	const comparable: Array<{ index: number; layer: LayerSpecification; item: LayerRevisionValue }> =
		[];
	let layerMissing = false;

	for (let index = 0; index < values.length; index += 1) {
		const item = values[index];
		if (item.state === 'layer-missing') {
			layerMissing = true;
			entries.push({
				index,
				entry: { revision: item.revision, changes: [], kind: 'layer-missing' }
			});
			break;
		}
		if (item.state === 'error' || !item.layer) {
			entries.push({
				index,
				entry: {
					revision: item.revision,
					changes: [],
					kind: 'error',
					error: item.error ?? 'Could not load this revision.'
				}
			});
			continue;
		}
		comparable.push({ index, layer: item.layer, item });
	}

	for (let index = 0; index < comparable.length; index += 1) {
		const current = comparable[index];
		const older = comparable[index + 1];
		if (older) {
			const changes = layerChanges(current.layer, older.layer);
			if (changes.length === 0) continue;
			entries.push({
				index: current.index,
				entry: { revision: current.item.revision, layer: current.layer, changes, kind: 'changed' }
			});
			continue;
		}
		entries.push({
			index: current.index,
			entry: {
				revision: current.item.revision,
				layer: current.layer,
				changes: [],
				kind: layerMissing || !hasNext ? 'created' : 'oldest-loaded'
			}
		});
	}

	return entries.sort((left, right) => left.index - right.index).map(({ entry }) => entry);
};
