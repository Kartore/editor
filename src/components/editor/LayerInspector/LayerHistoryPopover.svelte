<script lang="ts">
	// レイヤーの履歴: そのレイヤーを変えた revision を新しい順に出し、何が変わったかと、その時点のレイヤーに戻すボタンを出す
	import type { LayerSpecification } from '@maplibre/maplibre-gl-style-spec';
	import { Popover } from 'bits-ui';
	import { ClockCounterClockwise } from 'phosphor-svelte';
	import { onDestroy } from 'svelte';

	import { Button } from '#src/components/common/Button';
	import { useStyleHistory } from '#src/contexts/styleHistory.svelte.ts';
	import type { StyleHistoryProvider, StyleHistoryRevision } from '#src/editor/EditorModule.ts';
	import {
		computeLayerHistoryEntries,
		loadLayerRevisionValue,
		type LayerHistoryEntry,
		type LayerRevisionValue
	} from '#src/utils/layerHistory.ts';
	import { cn } from '#src/utils/tailwindUtil.ts';

	let {
		layer,
		readOnly = false,
		onRestore
	}: {
		layer: LayerSpecification;
		readOnly?: boolean;
		onRestore: (layer: LayerSpecification) => void;
	} = $props();

	const history = useStyleHistory();
	const provider = $derived(history?.provider ?? null);
	const providerLabel = $derived(provider?.label ?? 'Connected style');

	/** 変わったところはこの数まで並べ、残りは数だけ出す */
	const SHOWN_CHANGES = 6;

	let open = $state(false);
	let loading = $state(false);
	let loadedCount = $state(0);
	let totalCount = $state(0);
	let hasNext = $state(false);
	let nextPage = $state(1);
	let error = $state<string | null>(null);
	let values = $state<LayerRevisionValue[]>([]);
	let entries = $state<LayerHistoryEntry[]>([]);
	let generation = 0;

	const errorMessage = (value: unknown): string =>
		value instanceof Error ? value.message : value ? String(value) : 'Could not load history.';
	const same = (left: unknown, right: unknown): boolean =>
		JSON.stringify(left) === JSON.stringify(right);
	const firstLine = (message: string): string => message.split(/\r?\n/, 1)[0] || '(No message)';
	const formatDate = (authoredAt: string): string => {
		const date = new Date(authoredAt);
		if (Number.isNaN(date.getTime())) return 'Unknown date';
		const parts = new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		}).formatToParts(date);
		const part = (type: Intl.DateTimeFormatPartTypes): string =>
			parts.find((candidate) => candidate.type === type)?.value ?? '';
		return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
	};

	const loadValues = async (
		revisions: StyleHistoryRevision[],
		activeProvider: StyleHistoryProvider,
		layerId: string,
		requestGeneration: number
	): Promise<LayerRevisionValue[] | null> => {
		const results: Array<LayerRevisionValue | undefined> = Array.from({ length: revisions.length });
		let cursor = 0;
		const worker = async () => {
			while (requestGeneration === generation && cursor < revisions.length) {
				const index = cursor;
				cursor += 1;
				const result = await loadLayerRevisionValue(activeProvider, revisions[index], layerId);
				if (requestGeneration !== generation) return;
				results[index] = result;
				loadedCount += 1;
			}
		};
		await Promise.all(Array.from({ length: Math.min(4, revisions.length) }, () => worker()));
		return requestGeneration === generation
			? results.filter((result): result is LayerRevisionValue => result !== undefined)
			: null;
	};

	const loadPage = async (page: number, reset: boolean) => {
		const activeProvider = provider;
		if (!activeProvider) return;
		const layerId = layer.id;
		const requestGeneration = reset ? ++generation : generation;
		if (reset) {
			hasNext = false;
			nextPage = 1;
			values = [];
			entries = [];
		}
		loading = true;
		loadedCount = 0;
		totalCount = 0;
		error = null;
		try {
			const response = await activeProvider.listRevisions({ page, scope: { layerId } });
			if (requestGeneration !== generation) return;
			totalCount = response.revisions.length;
			hasNext = response.hasNext;
			const loaded = await loadValues(
				response.revisions,
				activeProvider,
				layerId,
				requestGeneration
			);
			if (!loaded || requestGeneration !== generation) return;
			values = reset ? loaded : [...values, ...loaded];
			entries = computeLayerHistoryEntries(values, hasNext);
			// 作られた revision まで読んだら、それより古いものは要らない
			if (entries.some((entry) => entry.kind === 'layer-missing' || entry.kind === 'created')) {
				hasNext = false;
			}
			nextPage = page + 1;
		} catch (loadError) {
			if (requestGeneration === generation) error = errorMessage(loadError);
		} finally {
			if (requestGeneration === generation) loading = false;
		}
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) {
			void loadPage(1, true);
			return;
		}
		generation += 1;
		loading = false;
	};

	onDestroy(() => {
		generation += 1;
	});
</script>

<Popover.Root bind:open onOpenChange={handleOpenChange}>
	<Popover.Trigger
		aria-label="Layer history"
		title="Layer history"
		class="flex size-6 items-center justify-center rounded-[5px] text-ink-3 hover:bg-field hover:text-ink-1 data-[state=open]:bg-accent-soft data-[state=open]:text-accent"
	>
		<ClockCounterClockwise size={16} weight="regular" aria-hidden="true" />
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			class="z-50 w-[28rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-hairline-soft bg-white shadow-xl shadow-ink-1/15"
			side="left"
			align="start"
			sideOffset={8}
			collisionPadding={8}
		>
			<header class="border-b border-hairline-soft bg-field px-4 py-3">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<h2 class="truncate text-[11.5px] font-semibold text-ink-1">{layer.id} history</h2>
						<p class="mt-0.5 truncate font-mono text-[11px] text-ink-3" title={providerLabel}>
							{providerLabel}
						</p>
					</div>
					{#if loading}
						<span
							class="shrink-0 rounded-full bg-accent-soft px-2 py-1 text-[10px] font-semibold text-accent"
							aria-live="polite"
						>
							{#if totalCount > 0}{loadedCount}/{totalCount}{:else}Loading…{/if}
						</span>
					{/if}
				</div>
			</header>

			<div class="max-h-[min(32rem,calc(100vh-8rem))] overflow-y-auto overscroll-contain">
				{#if entries.length > 0}
					<ol class="relative ml-5 border-l border-hairline-soft py-1">
						{#each entries as entry (`${entry.revision.id}-${entry.kind}`)}
							<li class="relative border-b border-hairline-soft py-3 pr-4 pl-4 last:border-b-0">
								<span
									aria-hidden="true"
									class={cn(
										'absolute top-4 -left-[5px] h-2.5 w-2.5 rounded-full border-2 border-white',
										entry.kind === 'error'
											? 'bg-ink-1'
											: entry.kind === 'layer-missing'
												? 'bg-ink-4'
												: 'bg-accent'
									)}
								></span>

								{#if entry.kind === 'layer-missing'}
									<p class="text-xs font-semibold text-ink-3">Before this layer was created</p>
								{:else if entry.kind === 'error'}
									<p class="text-xs font-semibold text-ink-2">Could not read this revision</p>
									<p class="mt-1 text-xs text-ink-2">{entry.error}</p>
								{:else}
									<div class="flex min-w-0 items-start gap-2">
										<div class="min-w-0 flex-1">
											<p class="truncate text-xs font-semibold text-ink-1">
												{firstLine(entry.revision.message)}
											</p>
											{#if entry.kind === 'created'}
												<p class="mt-1 text-[10px] text-ink-3">Layer created</p>
											{:else if entry.kind === 'oldest-loaded'}
												<p class="mt-1 text-[10px] text-ink-3">Oldest revision currently loaded</p>
											{:else}
												<div class="mt-1.5 flex flex-wrap gap-1">
													{#each entry.changes.slice(0, SHOWN_CHANGES) as change (change)}
														<code
															class="max-w-full truncate rounded border border-hairline-soft bg-field px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
															>{change}</code
														>
													{/each}
													{#if entry.changes.length > SHOWN_CHANGES}
														<span class="px-1 py-0.5 text-[10px] text-ink-3"
															>+{entry.changes.length - SHOWN_CHANGES} more</span
														>
													{/if}
												</div>
											{/if}
										</div>
										{#if entry.layer && same(entry.layer, layer)}
											<span
												class="shrink-0 rounded-full bg-field px-2 py-1 text-[10px] font-semibold text-ink-3"
												>Current</span
											>
										{:else if entry.layer && !readOnly}
											{@const restored = entry.layer}
											<Button
												aria-label={`Restore ${layer.id} from ${entry.revision.id.slice(0, 7)}`}
												class="shrink-0 rounded border border-accent bg-accent-soft px-2 py-1 text-[10px] font-semibold text-accent hover:bg-accent-soft"
												onclick={() => {
													onRestore(restored);
													open = false;
												}}
											>
												Restore
											</Button>
										{/if}
									</div>
								{/if}

								<div class="mt-2 flex min-w-0 items-center gap-1.5 text-[10px] text-ink-3">
									{#if entry.revision.avatarUrl}
										<img
											class="h-4 w-4 shrink-0 rounded-full"
											src={entry.revision.avatarUrl}
											alt=""
											loading="lazy"
										/>
									{/if}
									{#if entry.revision.authorName}
										<span class="shrink-0 font-medium text-ink-2">{entry.revision.authorName}</span>
										<span aria-hidden="true">·</span>
									{/if}
									<time class="shrink-0" datetime={entry.revision.authoredAt}
										>{formatDate(entry.revision.authoredAt)}</time
									>
									<span class="min-w-0 flex-1"></span>
									{#if entry.revision.htmlUrl}
										<a
											class="shrink-0 font-mono text-accent hover:underline"
											href={entry.revision.htmlUrl}
											target="_blank"
											rel="noreferrer"
											aria-label={`Open revision ${entry.revision.id.slice(0, 7)}`}
											>{entry.revision.id.slice(0, 7)}</a
										>
									{:else}
										<code class="shrink-0">{entry.revision.id.slice(0, 7)}</code>
									{/if}
								</div>
							</li>
						{/each}
					</ol>
				{:else if !loading && !error}
					<div class="px-5 py-8 text-center">
						<p class="text-[11px] font-semibold text-ink-2">No layer history</p>
						<p class="mt-1 text-xs text-ink-3">No saved revision has changed this layer.</p>
					</div>
				{:else if loading}
					<div class="space-y-3 px-4 py-5" aria-hidden="true">
						<div class="h-3 w-2/3 animate-pulse rounded bg-field"></div>
						<div class="h-3 w-5/6 animate-pulse rounded bg-field"></div>
						<div class="h-3 w-1/2 animate-pulse rounded bg-field"></div>
					</div>
				{/if}
			</div>

			{#if error || hasNext}
				<footer class="border-t border-hairline-soft bg-field px-4 py-2.5">
					{#if error}
						<div class="flex items-center justify-between gap-3">
							<p class="min-w-0 flex-1 truncate text-xs text-ink-2" title={error}>{error}</p>
							<Button
								class="shrink-0 rounded px-2 py-1 text-xs font-semibold text-ink-2 hover:bg-field"
								onclick={() =>
									void loadPage(values.length === 0 ? 1 : nextPage, values.length === 0)}
							>
								Retry
							</Button>
						</div>
					{:else}
						<Button
							class="w-full rounded border border-hairline-soft bg-white px-3 py-1.5 text-xs font-semibold text-ink-2 hover:border-hairline hover:bg-field disabled:cursor-wait disabled:opacity-60"
							disabled={loading}
							onclick={() => void loadPage(nextPage, false)}
						>
							{loading ? `Loading ${loadedCount}/${totalCount}…` : 'Load more'}
						</Button>
					{/if}
				</footer>
			{/if}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
