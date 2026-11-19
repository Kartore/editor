import type { VectorSourceSpecification } from '@maplibre/maplibre-gl-style-spec';
import { createQuery } from '@tanstack/svelte-query';
import type { ResourceType } from 'maplibre-gl';

import { useResourceLoader } from '#src/contexts/requestTransform.ts';

type SourceVectorLayer = {
	id: string;
	fields?: Record<string, string>;
	description?: string;
	minzoom?: number;
	maxzoom?: number;
	source?: string;
	source_name?: string;
};

export type TileJsonMetadata = {
	tilejson?: string;
	name?: string;
	description?: string;
	minzoom?: number;
	maxzoom?: number;
	tiles?: string[];
	vector_layers?: SourceVectorLayer[];
};

export const createSourceLayers = (getSource: () => VectorSourceSpecification | undefined) => {
	const url = $derived(getSource()?.url);
	// TileJSON もアダプタの書き換えを通す (ResourceType は const enum なので文字列値)
	const loader = useResourceLoader();
	const query = createQuery(() => ({
		queryKey: ['tilejson', url],
		enabled: !!url,
		queryFn: async () => {
			const response = await loader.fetch(url!, 'Source' as ResourceType);
			if (!response.ok) throw new Error(`TileJSON request failed (${response.status}).`);
			return (await response.json()) as TileJsonMetadata;
		}
	}));

	return {
		get sourceLayers(): SourceVectorLayer[] | undefined {
			return query.data?.vector_layers ?? undefined;
		},
		get tileJson(): TileJsonMetadata | undefined {
			return query.data ?? undefined;
		},
		get isLoading(): boolean {
			return query.isFetching;
		},
		get error(): Error | undefined {
			return query.error instanceof Error ? query.error : undefined;
		},
		refetch: () => query.refetch()
	};
};
