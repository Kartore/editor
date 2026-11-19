<script lang="ts" module>
	import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';

	export type ExpressionAppendArgButtonProps = {
		value: ExpressionSpecification;
		onChange?: (value: ExpressionSpecification) => void;
		class?: string;
		label?: string;
		ariaLabel?: string;
	};
</script>

<script lang="ts">
	import { Plus } from 'phosphor-svelte';

	import { Button } from '#src/components/common/Button';
	import { insertArgsAt } from '#src/components/common/FilterInputField/expressions/utils/expressionEdit.ts';
	import { getExpressionOperatorMeta } from '#src/components/common/FilterInputField/expressions/utils/expressionRegistry.ts';
	import { cn } from '#src/utils/tailwindUtil.ts';

	let {
		value,
		onChange,
		class: className,
		label = 'Add argument',
		ariaLabel = 'Add argument'
	}: ExpressionAppendArgButtonProps = $props();

	const variadic = $derived(getExpressionOperatorMeta(value[0])?.variadic);
</script>

{#if variadic && onChange}
	<Button
		aria-label={ariaLabel}
		title={ariaLabel}
		class={cn(
			'flex h-6 items-center gap-1 rounded-[6px] px-1.5 text-[10px] font-semibold text-ink-3 hover:bg-black/5 hover:text-ink-1',
			className
		)}
		onclick={() => {
			if (!variadic) return;
			onChange?.(
				insertArgsAt(value, value.length - variadic.tailCount, variadic.newArgsTemplate(value))
			);
		}}
	>
		<Plus size={14} weight="regular" aria-hidden="true" />
		{label.replace(/^\+\s*/, '')}
	</Button>
{/if}
