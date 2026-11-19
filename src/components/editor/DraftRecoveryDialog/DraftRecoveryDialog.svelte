<script lang="ts">
	import { AlertDialog } from 'bits-ui';
	import { Warning } from 'phosphor-svelte';

	import type { LocalDraftRecoveryPrompt } from '#src/editor/localDraft/localDraftSession.svelte.ts';

	let {
		prompt,
		onRestore,
		onDiscard
	}: {
		prompt: LocalDraftRecoveryPrompt | null;
		onRestore: () => void;
		onDiscard: () => void;
	} = $props();

	// 「捨てて開く」は取り消せないので、もう一段確かめる。別のダイアログ (スコープ・編集時刻が違う) になったら戻す
	const promptKey = $derived(prompt ? `${prompt.scope}\u0000${prompt.meta.editedAt}` : null);
	let confirmingKey = $state<string | null>(null);
	const confirmingDiscard = $derived(promptKey !== null && confirmingKey === promptKey);

	const formatTime = (time: number | null): string =>
		time === null
			? 'Unknown'
			: new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

	const bases = $derived(prompt?.inspections.flatMap(({ base }) => (base ? [base] : [])) ?? []);
	const warnings = $derived(prompt?.inspections.flatMap(({ warnings = [] }) => warnings) ?? []);

	const buttonClass =
		'h-9 cursor-pointer rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
</script>

<AlertDialog.Root open={prompt !== null}>
	<AlertDialog.Portal>
		<AlertDialog.Overlay class="fixed inset-0 z-50 bg-ink-1/35 backdrop-blur-[1px]" />
		<AlertDialog.Content
			escapeKeydownBehavior="ignore"
			interactOutsideBehavior="ignore"
			class="fixed top-1/2 left-1/2 z-[60] w-[min(28rem,calc(100vw-1.5rem))] -translate-1/2 rounded-lg border border-hairline bg-white p-4 shadow-xl shadow-ink-1/20 outline-none"
		>
			{#if prompt}
				<div class="flex flex-col gap-4" data-draft-recovery>
					{#if confirmingDiscard}
						<div class="flex flex-col gap-1">
							<AlertDialog.Title class="text-base font-semibold text-ink-1">
								Discard unsaved edits?
							</AlertDialog.Title>
							<AlertDialog.Description class="text-xs leading-5 text-ink-3">
								The edits from {formatTime(prompt.meta.editedAt)} will be deleted from this browser. This
								cannot be undone.
							</AlertDialog.Description>
						</div>
						<div class="flex justify-end gap-2">
							<button
								type="button"
								class="{buttonClass} text-ink-2 hover:bg-field"
								onclick={() => (confirmingKey = null)}
							>
								Back
							</button>
							<button type="button" class="{buttonClass} bg-ink-1 text-white" onclick={onDiscard}>
								Discard edits
							</button>
						</div>
					{:else}
						<div class="flex flex-col gap-1">
							<AlertDialog.Title class="text-base font-semibold text-ink-1">
								Recover unsaved edits?
							</AlertDialog.Title>
							<AlertDialog.Description class="text-xs leading-5 text-ink-3">
								This style has edits in this browser that have not been saved.
							</AlertDialog.Description>
						</div>
						<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs leading-5">
							<dt class="text-ink-3">Last edited</dt>
							<dd class="text-ink-1" data-draft-edited-at>{formatTime(prompt.meta.editedAt)}</dd>
							<dt class="text-ink-3">Based on</dt>
							<dd class="text-ink-1" data-draft-base>
								{#if bases.length > 0}
									{bases.join(' / ')}
								{:else if prompt.inspecting}
									Checking…
								{:else}
									Unknown
								{/if}
							</dd>
						</dl>
						{#if warnings.length > 0}
							<ul class="flex flex-col gap-1" data-draft-warnings>
								{#each warnings as warning, index (index)}
									<li
										class="flex items-start gap-2 rounded-md bg-field px-2 py-1.5 text-xs leading-5 text-ink-1"
									>
										<Warning size={14} class="mt-0.5 shrink-0 text-ink-2" aria-hidden="true" />
										<span>{warning}</span>
									</li>
								{/each}
							</ul>
						{/if}
						<div class="flex justify-end gap-2">
							<button
								type="button"
								class="{buttonClass} text-ink-2 hover:bg-field"
								onclick={() => (confirmingKey = promptKey)}
							>
								Discard and open
							</button>
							<button type="button" class="{buttonClass} bg-ink-1 text-white" onclick={onRestore}>
								Recover
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
