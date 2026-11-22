import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';

import type { StyleHistoryProvider, StyleHistoryRevision } from '#src/editor/EditorModule.ts';

import {
	computeLayerHistoryEntries,
	layerChanges,
	loadLayerRevisionValue,
	type LayerRevisionValue
} from './layerHistory.ts';

const revision = (id: string): StyleHistoryRevision => ({
	id,
	message: `Revision ${id}`,
	authorName: 'Map editor',
	authoredAt: '2026-07-13T00:00:00Z'
});

const road = (paint: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
	({ id: 'road', type: 'line', source: 'basemap', paint, ...extra }) as LayerSpecification;

const value = (id: string, layer: LayerSpecification): LayerRevisionValue => ({
	revision: revision(id),
	state: 'value',
	layer
});

describe('layerChanges', () => {
	it('lists paint and layout properties one by one and other keys as they are', () => {
		expect(
			layerChanges(
				road(
					{ 'line-color': '#f00', 'line-width': 2 },
					{ layout: { visibility: 'none' }, minzoom: 5 }
				),
				road({ 'line-color': '#00f', 'line-width': 2 }, { filter: ['==', 'class', 'main'] })
			)
		).toEqual(['filter', 'layout.visibility', 'minzoom', 'paint.line-color']);
		expect(layerChanges(road({ 'line-width': 2 }), road({ 'line-width': 2 }))).toEqual([]);
	});
});

describe('computeLayerHistoryEntries', () => {
	it('keeps only the revisions that changed the layer, and where it was created', () => {
		const entries = computeLayerHistoryEntries(
			[
				value('c', road({ 'line-color': '#f00' })),
				value('b', road({ 'line-color': '#00f' })),
				value('a', road({ 'line-color': '#00f' })),
				{ revision: revision('0'), state: 'layer-missing' }
			],
			true
		);
		expect(entries.map((entry) => [entry.revision.id, entry.kind, entry.changes])).toEqual([
			['c', 'changed', ['paint.line-color']],
			['a', 'created', []],
			['0', 'layer-missing', []]
		]);
	});

	it('says the oldest loaded one is not known to be the first while there are more', () => {
		const values = [value('b', road({ 'line-color': '#f00' })), value('a', road({}))];
		expect(computeLayerHistoryEntries(values, true).at(-1)?.kind).toBe('oldest-loaded');
		expect(computeLayerHistoryEntries(values, false).at(-1)?.kind).toBe('created');
	});

	it('keeps a revision that could not be read and compares across it', () => {
		const entries = computeLayerHistoryEntries(
			[
				value('c', road({ 'line-color': '#f00' })),
				{ revision: revision('b'), state: 'error', error: 'offline' },
				value('a', road({ 'line-color': '#00f' }))
			],
			false
		);
		expect(entries.map((entry) => [entry.revision.id, entry.kind])).toEqual([
			['c', 'changed'],
			['b', 'error'],
			['a', 'created']
		]);
	});
});

describe('loadLayerRevisionValue', () => {
	const style = { version: 8, sources: {}, layers: [road({})] } as StyleSpecification;
	const provider = (overrides: Partial<StyleHistoryProvider>): StyleHistoryProvider => ({
		available: true,
		label: 'test',
		listRevisions: async () => ({ revisions: [], hasNext: false }),
		loadStyleAtRevision: async () => style,
		...overrides
	});

	it('reads the layer alone when the provider can, the whole style otherwise', async () => {
		expect(
			await loadLayerRevisionValue(
				provider({ loadLayerAtRevision: async () => null }),
				revision('a'),
				'road'
			)
		).toMatchObject({ state: 'layer-missing' });
		expect(await loadLayerRevisionValue(provider({}), revision('a'), 'road')).toMatchObject({
			state: 'value',
			layer: { id: 'road' }
		});
		expect(await loadLayerRevisionValue(provider({}), revision('a'), 'water')).toMatchObject({
			state: 'layer-missing'
		});
		expect(
			await loadLayerRevisionValue(
				provider({
					loadStyleAtRevision: async () => {
						throw new Error('offline');
					}
				}),
				revision('a'),
				'road'
			)
		).toEqual({ revision: revision('a'), state: 'error', error: 'offline' });
	});
});
