<script lang="ts">
	import { Plus, X } from 'phosphor-svelte';

	import { Button } from '#src/components/common/Button';
	import { NumberField } from '#src/components/common/NumberField';
	import { Select } from '#src/components/common/Select';
	import { spriteDimensionsFromSvg, svgDataUrl } from '#src/sprites/spriteSvg.ts';
	import {
		SPRITE_TEXT_FIT_VALUES,
		spriteIcon,
		type SpriteIcon,
		type SpriteIconMetadata,
		type SpriteStretchRange,
		type SpriteTextFit
	} from '#src/stores/spriteIcons';

	let {
		icon,
		readOnly = false,
		onChange
	}: {
		icon: SpriteIcon;
		readOnly?: boolean;
		onChange: (icon: SpriteIcon) => void;
	} = $props();

	type Axis = 'x' | 'y';
	type Handle =
		| { kind: 'stretch'; axis: Axis; index: number; edge: 0 | 1 }
		| { kind: 'content'; edge: 0 | 1 | 2 | 3 };

	// 拡大表示の最大サイズ (詳細パネルの幅に収まる大きさ)
	const PREVIEW_MAX_WIDTH = 176;
	const PREVIEW_MAX_HEIGHT = 128;
	// ドラッグ・キー操作の刻み (論理ピクセル)。@2x の画像ピクセルで 1px
	const STEP = 0.5;

	const dimensions = $derived(spriteDimensionsFromSvg(icon.svg));
	const width = $derived(Math.max(dimensions.width, 1));
	const height = $derived(Math.max(dimensions.height, 1));
	const scale = $derived(Math.min(PREVIEW_MAX_WIDTH / width, PREVIEW_MAX_HEIGHT / height, 16));

	const metadataOf = (
		source: SpriteIcon
	): Required<Pick<SpriteIconMetadata, 'stretchX' | 'stretchY'>> &
		Pick<SpriteIconMetadata, 'content'> => ({
		stretchX: (source.stretchX ?? []).map(([start, end]): SpriteStretchRange => [start, end]),
		stretchY: (source.stretchY ?? []).map(([start, end]): SpriteStretchRange => [start, end]),
		content: source.content ? [...source.content] : undefined
	});

	// ドラッグ中だけの値。離したときに 1 回だけ確定する (保存・地図の描き直しを毎フレーム起こさない)
	let draft = $state.raw<ReturnType<typeof metadataOf> | null>(null);
	let dragging = $state.raw<Handle | null>(null);
	const shown = $derived(draft ?? metadataOf(icon));

	const snap = (value: number) => Math.round(value / STEP) * STEP;
	const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

	const commit = (next: Partial<SpriteIconMetadata>) => {
		if (readOnly) return;
		onChange(spriteIcon(icon.svg, { ...icon, ...next }));
	};

	const rangesOf = (metadata: ReturnType<typeof metadataOf>, axis: Axis) =>
		axis === 'x' ? metadata.stretchX : metadata.stretchY;
	const sizeOf = (axis: Axis) => (axis === 'x' ? width : height);

	/** handle を value に動かした結果。隣の範囲や反対側の辺を越えないように止める */
	const moveHandle = (
		metadata: ReturnType<typeof metadataOf>,
		handle: Handle,
		value: number
	): ReturnType<typeof metadataOf> => {
		if (handle.kind === 'stretch') {
			const ranges = rangesOf(metadata, handle.axis).map(([start, end]): SpriteStretchRange => [
				start,
				end
			]);
			const range = ranges[handle.index];
			if (!range) return metadata;
			const min = handle.edge === 0 ? (ranges[handle.index - 1]?.[1] ?? 0) : range[0];
			const max =
				handle.edge === 0 ? range[1] : (ranges[handle.index + 1]?.[0] ?? sizeOf(handle.axis));
			range[handle.edge] = clamp(value, min, max);
			return handle.axis === 'x'
				? { ...metadata, stretchX: ranges }
				: { ...metadata, stretchY: ranges };
		}
		const content = [...(metadata.content ?? [0, 0, width, height])] as [
			number,
			number,
			number,
			number
		];
		const [left, top, right, bottom] = content;
		const bounds: Record<0 | 1 | 2 | 3, [number, number]> = {
			0: [0, right],
			1: [0, bottom],
			2: [left, width],
			3: [top, height]
		};
		const [min, max] = bounds[handle.edge];
		content[handle.edge] = clamp(value, min, max);
		return { ...metadata, content };
	};

	const handleValue = (metadata: ReturnType<typeof metadataOf>, handle: Handle): number =>
		handle.kind === 'stretch'
			? (rangesOf(metadata, handle.axis)[handle.index]?.[handle.edge] ?? 0)
			: (metadata.content?.[handle.edge] ?? 0);
	const handleAxis = (handle: Handle): Axis =>
		handle.kind === 'stretch' ? handle.axis : handle.edge % 2 === 0 ? 'x' : 'y';

	// ドラッグのイベントは拡大図の <svg> で受ける (pointer capture も svg に付ける)
	const pointerValue = (event: PointerEvent & { currentTarget: SVGSVGElement }, axis: Axis) => {
		const rect = event.currentTarget.getBoundingClientRect();
		return snap(
			axis === 'x' ? (event.clientX - rect.left) / scale : (event.clientY - rect.top) / scale
		);
	};

	const startDrag = (event: PointerEvent & { currentTarget: SVGGElement }, handle: Handle) => {
		if (readOnly || event.button !== 0) return;
		event.preventDefault();
		try {
			event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
		} catch {
			// 取れなくても svg 上で動かす分には追従する (キャプチャは枠の外へ出たときのため)
		}
		dragging = handle;
		draft = metadataOf(icon);
	};
	const handlePointerMove = (event: PointerEvent & { currentTarget: SVGSVGElement }) => {
		if (!dragging || !draft) return;
		draft = moveHandle(draft, dragging, pointerValue(event, handleAxis(dragging)));
	};
	const endDrag = (event: PointerEvent & { currentTarget: SVGSVGElement }) => {
		if (!dragging || !draft) return;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		const next = draft;
		dragging = null;
		draft = null;
		commit(next);
	};
	const cancelDrag = () => {
		dragging = null;
		draft = null;
	};

	const handleKeydown = (event: KeyboardEvent, handle: Handle) => {
		const axis = handleAxis(handle);
		const keys = axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
		const direction = event.key === keys[0] ? -1 : event.key === keys[1] ? 1 : 0;
		if (direction === 0 || readOnly) return;
		event.preventDefault();
		const current = metadataOf(icon);
		const step = event.shiftKey ? 1 : STEP;
		commit(moveHandle(current, handle, handleValue(current, handle) + direction * step));
	};

	const handleLabel = (handle: Handle): string => {
		if (handle.kind === 'content')
			return `Content ${['left', 'top', 'right', 'bottom'][handle.edge]}`;
		return `Stretch ${handle.axis.toUpperCase()} ${handle.index + 1} ${handle.edge === 0 ? 'start' : 'end'}`;
	};

	/** 新しい範囲: 空いている一番広い隙間の真ん中 1/3 */
	const addRange = (axis: Axis) => {
		const size = sizeOf(axis);
		const ranges = rangesOf(metadataOf(icon), axis);
		const edges = [0, ...ranges.flat(), size];
		let best: [number, number] = [0, 0];
		for (let index = 0; index < edges.length; index += 2) {
			const [start, end] = [edges[index], edges[index + 1]];
			if (end - start > best[1] - best[0]) best = [start, end];
		}
		const gap = best[1] - best[0];
		if (gap <= 0) return;
		const next: SpriteStretchRange = [
			snap(best[0] + gap / 3),
			Math.max(snap(best[0] + gap / 3), snap(best[0] + (gap * 2) / 3))
		];
		const sorted = [...ranges, next].sort((left, right) => left[0] - right[0]);
		commit(axis === 'x' ? { stretchX: sorted } : { stretchY: sorted });
	};
	const removeRange = (axis: Axis, index: number) => {
		const ranges = rangesOf(metadataOf(icon), axis).filter((_, current) => current !== index);
		commit(axis === 'x' ? { stretchX: ranges } : { stretchY: ranges });
	};
	const setRangeValue = (axis: Axis, index: number, edge: 0 | 1, value: number) => {
		const ranges = rangesOf(metadataOf(icon), axis).map(([start, end]): SpriteStretchRange => [
			start,
			end
		]);
		if (!ranges[index]) return;
		ranges[index][edge] = value;
		// 数値入力は自由に打てるようにし、並びだけ揃える (はみ出し・重なりは spritore の検証がエラーで知らせる)
		ranges.sort((left, right) => left[0] - right[0]);
		commit(axis === 'x' ? { stretchX: ranges } : { stretchY: ranges });
	};

	const setContentEnabled = (enabled: boolean) => {
		commit({
			content: enabled
				? [snap(width / 4), snap(height / 4), snap((width * 3) / 4), snap((height * 3) / 4)]
				: undefined
		});
	};
	const setContentValue = (edge: 0 | 1 | 2 | 3, value: number) => {
		const content = [...(icon.content ?? [0, 0, width, height])] as [
			number,
			number,
			number,
			number
		];
		content[edge] = value;
		commit({ content });
	};

	const TEXT_FIT_DEFAULT = 'default';
	const textFitItems = [
		{ value: TEXT_FIT_DEFAULT, label: 'Default' },
		...SPRITE_TEXT_FIT_VALUES.map((value) => ({ value, label: value }))
	];
	const setTextFit = (key: 'textFitWidth' | 'textFitHeight', value: string) => {
		const fit = SPRITE_TEXT_FIT_VALUES.find((candidate) => candidate === value);
		commit({ [key]: fit as SpriteTextFit | undefined });
	};

	const stretchHandles = (axis: Axis, ranges: SpriteStretchRange[]): Handle[] =>
		ranges.flatMap((_, index) =>
			[0, 1].map((edge) => ({ kind: 'stretch', axis, index, edge }) as Handle)
		);
	const contentHandles: Handle[] = [0, 1, 2, 3].map(
		(edge) => ({ kind: 'content', edge }) as Handle
	);
	// 拡大図の上の線 (論理ピクセル)。stretch の帯の境界と content の枠の辺
	const handleLine = (handle: Handle) => {
		const value = handleValue(shown, handle);
		if (handle.kind === 'stretch') {
			return handle.axis === 'x'
				? { x1: value, y1: 0, x2: value, y2: height }
				: { x1: 0, y1: value, x2: width, y2: value };
		}
		const [left, top, right, bottom] = shown.content ?? [0, 0, width, height];
		return handle.edge % 2 === 0
			? { x1: value, y1: top, x2: value, y2: bottom }
			: { x1: left, y1: value, x2: right, y2: value };
	};
	const handleColor = (handle: Handle) =>
		handle.kind === 'content'
			? 'var(--color-ink-1)'
			: handle.axis === 'x'
				? 'var(--color-accent)'
				: 'var(--color-ok)';
	const isDragging = (handle: Handle) =>
		dragging !== null && JSON.stringify(dragging) === JSON.stringify(handle);
</script>

<div class="flex flex-col gap-1.5">
	<div class="flex items-baseline justify-between">
		<p class="text-[10px] text-ink-2">Stretch</p>
		<p class="text-[10px] text-ink-3">for icon-text-fit</p>
	</div>

	<div
		class="relative mx-auto bg-[repeating-conic-gradient(var(--color-field)_0%_25%,white_0%_50%)] bg-[length:8px_8px] outline outline-1 outline-hairline"
		style:width={`${width * scale}px`}
		style:height={`${height * scale}px`}
	>
		<img
			src={svgDataUrl(icon.svg)}
			alt=""
			class="pointer-events-none absolute inset-0 size-full select-none"
			draggable="false"
		/>
		<svg
			class="absolute inset-0 size-full touch-none overflow-visible"
			viewBox={`0 0 ${width} ${height}`}
			preserveAspectRatio="none"
			role="group"
			aria-label="Stretch zones and content box"
			onpointermove={handlePointerMove}
			onpointerup={endDrag}
			onpointercancel={cancelDrag}
			onlostpointercapture={() => {
				if (dragging) cancelDrag();
			}}
		>
			{#each shown.stretchX as [start, end], index (index)}
				<rect
					x={start}
					y={0}
					width={end - start}
					{height}
					fill="var(--color-accent)"
					opacity="0.18"
				/>
			{/each}
			{#each shown.stretchY as [start, end], index (index)}
				<rect x={0} y={start} {width} height={end - start} fill="var(--color-ok)" opacity="0.18" />
			{/each}
			{#if shown.content}
				{@const [left, top, right, bottom] = shown.content}
				<rect
					x={left}
					y={top}
					width={right - left}
					height={bottom - top}
					fill="none"
					stroke="var(--color-ink-1)"
					stroke-width="1"
					stroke-dasharray="3 2"
					vector-effect="non-scaling-stroke"
				/>
			{/if}
			{#each [...stretchHandles('x', shown.stretchX), ...stretchHandles('y', shown.stretchY), ...(shown.content ? contentHandles : [])] as handle (JSON.stringify(handle))}
				{@const line = handleLine(handle)}
				{@const axis = handleAxis(handle)}
				<g
					role="slider"
					tabindex={readOnly ? -1 : 0}
					aria-label={handleLabel(handle)}
					aria-orientation={axis === 'x' ? 'horizontal' : 'vertical'}
					aria-valuemin={0}
					aria-valuemax={sizeOf(axis)}
					aria-valuenow={handleValue(shown, handle)}
					aria-disabled={readOnly}
					class={readOnly ? '' : axis === 'x' ? 'cursor-col-resize' : 'cursor-row-resize'}
					class:outline-none={true}
					onpointerdown={(event) => startDrag(event, handle)}
					onkeydown={(event) => handleKeydown(event, handle)}
				>
					<!-- 当たり判定を太くする透明な線 -->
					<line
						{...line}
						stroke="transparent"
						stroke-width="10"
						vector-effect="non-scaling-stroke"
					/>
					<line
						{...line}
						stroke={handleColor(handle)}
						stroke-width={isDragging(handle) ? 2.5 : 1.5}
						vector-effect="non-scaling-stroke"
					/>
				</g>
			{/each}
		</svg>
	</div>
	<p class="text-center font-mono text-[10px] text-ink-3">{width} × {height}</p>

	{#each ['x', 'y'] as const as axis (axis)}
		{@const ranges = rangesOf(metadataOf(icon), axis)}
		<div class="flex flex-col gap-1">
			<div class="flex items-center justify-between">
				<p class="flex items-center gap-1.5 text-[10px] text-ink-2">
					<span
						class="inline-block size-2 rounded-[2px]"
						style:background={axis === 'x' ? 'var(--color-accent)' : 'var(--color-ok)'}
						aria-hidden="true"
					></span>
					Stretch {axis.toUpperCase()}
				</p>
				<Button
					class="flex h-5 items-center gap-0.5 rounded-[4px] px-1 text-[10px] text-ink-2 hover:bg-field disabled:text-ink-4"
					disabled={readOnly}
					aria-label={`Add stretch ${axis.toUpperCase()} range`}
					onclick={() => addRange(axis)}
				>
					<Plus size={11} aria-hidden="true" /> Add
				</Button>
			</div>
			{#if ranges.length === 0}
				<p class="text-[10px] text-ink-3">Not set.</p>
			{/if}
			{#each ranges as [start, end], index (index)}
				<div class="flex items-center gap-1 [--field-label-width:0px]">
					<NumberField
						class="min-w-0 flex-1"
						aria-label={`Stretch ${axis.toUpperCase()} ${index + 1} start`}
						value={start}
						step={STEP}
						disabled={readOnly}
						onValueCommit={(value) => setRangeValue(axis, index, 0, value)}
					/>
					<span class="text-[10px] text-ink-3">–</span>
					<NumberField
						class="min-w-0 flex-1"
						aria-label={`Stretch ${axis.toUpperCase()} ${index + 1} end`}
						value={end}
						step={STEP}
						disabled={readOnly}
						onValueCommit={(value) => setRangeValue(axis, index, 1, value)}
					/>
					<Button
						class="flex size-6 shrink-0 items-center justify-center rounded-[4px] text-ink-3 hover:bg-field hover:text-ink-1"
						disabled={readOnly}
						aria-label={`Remove stretch ${axis.toUpperCase()} range ${index + 1}`}
						onclick={() => removeRange(axis, index)}
					>
						<X size={11} aria-hidden="true" />
					</Button>
				</div>
			{/each}
		</div>
	{/each}

	<div class="flex flex-col gap-1">
		<div class="flex items-center justify-between">
			<p class="flex items-center gap-1.5 text-[10px] text-ink-2">
				<span
					class="inline-block size-2 rounded-[2px] border border-dashed border-ink-1"
					aria-hidden="true"
				></span>
				Content
			</p>
			{#if icon.content}
				<Button
					class="flex h-5 items-center rounded-[4px] px-1 text-[10px] text-ink-2 hover:bg-field disabled:text-ink-4"
					disabled={readOnly}
					aria-label="Remove content box"
					onclick={() => setContentEnabled(false)}
				>
					Remove
				</Button>
			{:else}
				<Button
					class="flex h-5 items-center gap-0.5 rounded-[4px] px-1 text-[10px] text-ink-2 hover:bg-field disabled:text-ink-4"
					disabled={readOnly}
					aria-label="Add content box"
					onclick={() => setContentEnabled(true)}
				>
					<Plus size={11} aria-hidden="true" /> Add
				</Button>
			{/if}
		</div>
		{#if icon.content}
			<div class="grid grid-cols-2 gap-1 [--field-label-width:36px]">
				{#each ['left', 'top', 'right', 'bottom'] as name, edge (name)}
					<NumberField
						class="min-w-0"
						label={name}
						value={icon.content[edge]}
						step={STEP}
						disabled={readOnly}
						onValueCommit={(value) => setContentValue(edge as 0 | 1 | 2 | 3, value)}
					/>
				{/each}
			</div>
		{:else}
			<p class="text-[10px] text-ink-3">Not set.</p>
		{/if}
	</div>

	<div class="flex flex-col [--field-label-width:84px]">
		<Select
			label="textFitWidth"
			items={textFitItems}
			value={icon.textFitWidth ?? TEXT_FIT_DEFAULT}
			disabled={readOnly}
			onValueChange={(value) => setTextFit('textFitWidth', value)}
		/>
		<Select
			label="textFitHeight"
			items={textFitItems}
			value={icon.textFitHeight ?? TEXT_FIT_DEFAULT}
			disabled={readOnly}
			onValueChange={(value) => setTextFit('textFitHeight', value)}
		/>
	</div>
</div>
