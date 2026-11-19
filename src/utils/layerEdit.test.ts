import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';

import { duplicateLayer, duplicateLayerId, insertLayer, removeLayer } from './layerEdit.ts';

const layer = (id: string): LayerSpecification => ({ id, type: 'background' });
const style = (...ids: string[]): StyleSpecification => ({
	version: 8,
	sources: {},
	layers: ids.map(layer)
});
const ids = (value: StyleSpecification) => value.layers.map(({ id }) => id);

describe('layerEdit', () => {
	it('names duplicates without collisions', () => {
		expect(duplicateLayerId('a', style('a').layers)).toBe('a copy');
		expect(duplicateLayerId('a', style('a', 'a copy', 'a copy 2').layers)).toBe('a copy 3');
	});

	it('inserts above a layer or at the top', () => {
		expect(ids(insertLayer(style('a', 'b'), layer('x'), 'a'))).toEqual(['a', 'x', 'b']);
		expect(ids(insertLayer(style('a', 'b'), layer('x')))).toEqual(['a', 'b', 'x']);
		expect(ids(insertLayer(style('a', 'b'), layer('x'), 'missing'))).toEqual(['a', 'b', 'x']);
	});

	it('duplicates right after the original', () => {
		const result = duplicateLayer(style('a', 'b'), 'a');
		expect(result?.layerId).toBe('a copy');
		expect(ids(result!.style)).toEqual(['a', 'a copy', 'b']);
		expect(duplicateLayer(style('a'), 'missing')).toBeNull();
	});

	it('removes and picks the next layer to select', () => {
		expect(removeLayer(style('a', 'b', 'c'), 'b')).toMatchObject({ nextSelectedId: 'c' });
		expect(removeLayer(style('a', 'b'), 'b')).toMatchObject({ nextSelectedId: 'a' });
		expect(removeLayer(style('a'), 'a')).toMatchObject({ nextSelectedId: null });
		expect(removeLayer(style('a'), 'missing')).toBeNull();
	});
});
