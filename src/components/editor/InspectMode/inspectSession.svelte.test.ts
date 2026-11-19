import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';

import { BackgroundMapContext } from '#src/contexts/backgroundMap.svelte.ts';
import type { EditorPreview } from '#src/editor/EditorModule.ts';

import { InspectSession } from './inspectSession.svelte.ts';

const style: StyleSpecification = {
	version: 8,
	sources: { osm: { type: 'vector', tiles: ['https://tiles/{z}/{x}/{y}.pbf'] } },
	layers: [
		{ id: 'bg', type: 'background' },
		{ id: 'roads', type: 'line', source: 'osm', 'source-layer': 'transportation' }
	]
};

const setup = (initialPreview: EditorPreview | null = null) => {
	const backgroundMap = new BackgroundMapContext();
	const filterHighlight = {
		layerId: 'roads'
	} as unknown as BackgroundMapContext['filterHighlight'];
	backgroundMap.filterHighlight = filterHighlight;
	let preview = initialPreview;
	const cancelTransientEdit = vi.fn();
	const session = new InspectSession({
		backgroundMap,
		requestTransform: { resolve: async (url) => ({ url }) },
		getStyle: () => preview?.style ?? style,
		getPreview: () => preview,
		setPreview: (next) => (preview = next),
		cancelTransientEdit
	});
	return {
		session,
		backgroundMap,
		filterHighlight,
		getPreview: () => preview,
		cancelTransientEdit
	};
};

describe('InspectSession', () => {
	it('previews a copy of the style while active and restores everything on end', () => {
		const previous: EditorPreview = { label: 'History', style };
		const { session, backgroundMap, filterHighlight, getPreview, cancelTransientEdit } =
			setup(previous);

		session.begin();
		expect(cancelTransientEdit).toHaveBeenCalled();
		expect(session.active).toBe(true);
		expect(session.session).toBe(1);
		expect(backgroundMap.filterHighlight).toBeNull();
		expect(getPreview()).toMatchObject({ label: 'Point inspection' });
		expect(session.stylePreview).not.toBe(style);
		expect(session.stylePreview).toEqual(style);

		session.end();
		expect(session.active).toBe(false);
		expect(session.session).toBe(2);
		expect(backgroundMap.filterHighlight).toBe(filterHighlight);
		expect(getPreview()).toBe(previous);
		expect(session.stylePreview).toBeNull();
	});

	it('highlights the popover feature, then the clicked one, then the hovered one', () => {
		const { session } = setup();
		session.begin();
		const feature = (layerId: string) => ({ layerId, sourceId: 'osm', properties: {} }) as never;
		session.hover = { feature: feature('hover') } as never;
		expect(session.highlight).toMatchObject({ layerId: 'hover' });
		session.showPopup({ features: [feature('a'), feature('b')] } as never);
		expect(session.hover).toBeNull();
		session.selectFeature(1);
		expect(session.highlight).toMatchObject({ layerId: 'b' });
		session.popoverHighlight = feature('pointed');
		expect(session.highlight).toMatchObject({ layerId: 'pointed' });
		session.closePopup();
		expect(session.popup).toBeNull();
		expect(session.highlight).toBeNull();
	});

	it('finds the layer of a feature and tries a property filter on the preview only', () => {
		const { session, getPreview } = setup();
		session.begin();
		const roads = session.layerForFeature({
			layerId: 'unknown',
			sourceId: 'osm',
			sourceLayer: 'transportation'
		} as never);
		expect(roads?.id).toBe('roads');

		session.addFeatureFilter(roads!, 'class', 'motorway');
		const previewed = getPreview()!.style.layers.find(({ id }) => id === 'roads');
		expect(previewed).toMatchObject({ filter: ['all', ['==', ['get', 'class'], 'motorway']] });
		expect(style.layers[1]).not.toHaveProperty('filter');
	});
});
