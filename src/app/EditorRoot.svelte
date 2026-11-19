<script lang="ts">
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { adapterProviders } from './adapters.ts';

	import { setWorkerUrl } from 'maplibre-gl';
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

	import AdapterProviders from '#src/components/AdapterProviders.svelte';

	if (typeof window !== 'undefined') {
		setWorkerUrl(workerUrl);
	}

	let { children } = $props();

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: Infinity,
				refetchOnWindowFocus: false,
				retry: 1
			}
		}
	});
</script>

<QueryClientProvider client={queryClient}>
	<AdapterProviders providers={adapterProviders}>
		{@render children()}
	</AdapterProviders>
</QueryClientProvider>
