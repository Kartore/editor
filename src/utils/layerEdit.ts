import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

/** `<id> copy`、使われていれば `<id> copy 2`, `<id> copy 3` … */
export const duplicateLayerId = (baseId: string, layers: readonly LayerSpecification[]): string => {
	let candidate = `${baseId} copy`;
	for (let n = 2; layers.some((layer) => layer.id === candidate); n++) {
		candidate = `${baseId} copy ${n}`;
	}
	return candidate;
};

/** aboveLayerId の直後 (無ければ末尾 = 最前面) にレイヤーを入れる */
export const insertLayer = (
	style: StyleSpecification,
	layer: LayerSpecification,
	aboveLayerId?: string
): StyleSpecification => {
	const layers = [...style.layers];
	const index = aboveLayerId
		? layers.findIndex(({ id }) => id === aboveLayerId) + 1
		: layers.length;
	layers.splice(index > 0 ? index : layers.length, 0, layer);
	return { ...style, layers };
};

/** レイヤーを複製して直後に置く。見つからなければ null */
export const duplicateLayer = (
	style: StyleSpecification,
	layerId: string
): { style: StyleSpecification; layerId: string } | null => {
	const index = style.layers.findIndex((layer) => layer.id === layerId);
	if (index === -1) return null;
	const copy = structuredClone(style.layers[index]);
	copy.id = duplicateLayerId(copy.id, style.layers);
	const layers = [...style.layers];
	layers.splice(index + 1, 0, copy);
	return { style: { ...style, layers }, layerId: copy.id };
};

/** レイヤーを消し、次に選ぶレイヤー (同じ位置、無ければ 1 つ前) を返す。見つからなければ null */
export const removeLayer = (
	style: StyleSpecification,
	layerId: string
): { style: StyleSpecification; nextSelectedId: string | null } | null => {
	const index = style.layers.findIndex((layer) => layer.id === layerId);
	if (index === -1) return null;
	const layers = style.layers.filter((_, i) => i !== index);
	return {
		style: { ...style, layers },
		nextSelectedId: (layers[index] ?? layers[index - 1])?.id ?? null
	};
};
