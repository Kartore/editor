<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { File } from 'phosphor-svelte';

	import type { StyleTemplate, StyleTemplateCatalog } from '#src/editor/EditorModule.ts';

	let {
		open = $bindable(false),
		catalogs,
		onBlank,
		onTemplate
	}: {
		open?: boolean;
		/** available な雛形の一覧 (registerStyleTemplates) */
		catalogs: StyleTemplateCatalog[];
		onBlank: () => void;
		onTemplate: (template: StyleTemplate) => Promise<void>;
	} = $props();

	type Section = {
		label: string;
		templates: StyleTemplate[];
		loading: boolean;
		error: string | null;
	};

	let sections = $state<Section[]>([]);
	let applying = $state<string | null>(null);
	let applyError = $state<string | null>(null);
	let generation = 0;

	const errorMessage = (error: unknown): string =>
		error instanceof Error ? error.message : String(error);

	// 開くたびに一覧を読み直す (雛形はあとから増える)
	$effect(() => {
		if (!open) return;
		const current = ++generation;
		applyError = null;
		sections = catalogs.map((catalog) => ({
			label: catalog.label,
			templates: [],
			loading: true,
			error: null
		}));
		catalogs.forEach((catalog, index) => {
			catalog.list().then(
				(templates) => {
					if (current === generation)
						sections[index] = { ...sections[index]!, templates, loading: false };
				},
				(error: unknown) => {
					if (current === generation)
						sections[index] = { ...sections[index]!, loading: false, error: errorMessage(error) };
				}
			);
		});
	});

	const chooseBlank = () => {
		if (applying) return;
		onBlank();
		open = false;
	};

	const chooseTemplate = async (key: string, template: StyleTemplate) => {
		if (applying) return;
		applying = key;
		applyError = null;
		try {
			await onTemplate(template);
			open = false;
		} catch (error) {
			applyError = `Could not open “${template.title}”: ${errorMessage(error)}`;
		} finally {
			applying = null;
		}
	};

	const cardClass =
		'flex w-full cursor-pointer items-start gap-3 rounded-md border border-hairline px-3 py-2.5 text-left outline-none hover:bg-field focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-60';
</script>

<Dialog.Root
	bind:open={
		() => open,
		(value) => {
			if (!applying) open = value;
		}
	}
>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-ink-1/30" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 flex max-h-[min(40rem,calc(100vh-3rem))] w-[min(32rem,calc(100vw-1.5rem))] -translate-1/2 flex-col gap-4 rounded-lg border border-hairline bg-white p-4 shadow-lg outline-none"
		>
			<div class="flex flex-col gap-1">
				<Dialog.Title class="text-base font-semibold text-ink-1">New style</Dialog.Title>
				<Dialog.Description class="text-xs leading-5 text-ink-3">
					Start from an empty style or from a template. The current style is replaced.
				</Dialog.Description>
			</div>

			<div class="-mx-1 flex min-h-0 flex-col gap-3 overflow-y-auto px-1">
				<button type="button" class={cardClass} disabled={applying !== null} onclick={chooseBlank}>
					<span
						class="flex size-12 shrink-0 items-center justify-center rounded-[5px] bg-field text-ink-3"
					>
						<File size={20} weight="regular" aria-hidden="true" />
					</span>
					<span class="flex min-w-0 flex-col gap-0.5">
						<span class="text-xs font-semibold text-ink-1">Blank style</span>
						<span class="text-[11px] leading-4 text-ink-3">No sources and no layers.</span>
					</span>
				</button>

				{#each sections as section, sectionIndex (sectionIndex)}
					<section class="flex flex-col gap-1.5" aria-label={section.label}>
						<h3 class="text-[11px] font-semibold text-ink-2">{section.label}</h3>
						{#if section.loading}
							<p class="text-[11px] text-ink-3">Loading…</p>
						{:else if section.error}
							<p class="text-[11px] text-danger" role="alert">{section.error}</p>
						{:else if section.templates.length === 0}
							<p class="text-[11px] text-ink-3">No templates.</p>
						{/if}
						{#each section.templates as template (template.id)}
							{@const key = `${sectionIndex}:${template.id}`}
							<button
								type="button"
								class={cardClass}
								disabled={applying !== null}
								onclick={() => chooseTemplate(key, template)}
							>
								{#if template.thumbnailUrl}
									<img
										src={template.thumbnailUrl}
										alt=""
										class="size-12 shrink-0 rounded-[5px] bg-field object-cover"
									/>
								{:else}
									<span class="size-12 shrink-0 rounded-[5px] bg-field"></span>
								{/if}
								<span class="flex min-w-0 flex-col gap-0.5">
									<span class="truncate text-xs font-semibold text-ink-1">{template.title}</span>
									{#if applying === key}
										<span class="text-[11px] leading-4 text-ink-3">Opening…</span>
									{:else if template.description}
										<span class="line-clamp-2 text-[11px] leading-4 text-ink-3">
											{template.description}
										</span>
									{/if}
								</span>
							</button>
						{/each}
					</section>
				{/each}
			</div>

			{#if applyError}
				<p
					class="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[11px] leading-4 text-danger"
					role="alert"
				>
					{applyError}
				</p>
			{/if}

			<div class="flex justify-end">
				<Dialog.Close
					disabled={applying !== null}
					class="h-8 cursor-pointer rounded-md px-3 text-xs font-semibold text-ink-3 hover:bg-field focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:text-ink-4"
				>
					Cancel
				</Dialog.Close>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
