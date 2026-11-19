<script lang="ts" module>
	import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
	import { getContext, setContext, type Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { StylePropertySpec } from '#src/utils/layerSpec.ts';

	export type ExpressionInputFieldProps = Omit<HTMLAttributes<HTMLDivElement>, 'onchange'> & {
		class?: string;
		children?: Snippet;
		value: ExpressionSpecification;
		zoomRange?: [number, number];
		propertySpec?: StylePropertySpec;
		/** nested expressions use the same left-rule hierarchy as nested filter groups */
		nested?: boolean;
		onChange?: (value: ExpressionSpecification) => void;
	};

	const EXPRESSION_DEPTH_KEY = Symbol('expression-depth');

	/** Registers this expression below its parent and returns root-first depth (root = 0). */
	export const useExpressionDepth = (): number => {
		const depth = (getContext<number | undefined>(EXPRESSION_DEPTH_KEY) ?? -1) + 1;
		setContext(EXPRESSION_DEPTH_KEY, depth);
		return depth;
	};
</script>

<script lang="ts">
	import type { Component } from 'svelte';
	import { cn } from '#src/utils/tailwindUtil.ts';

	import {
		RgbaInputField,
		isRgbaExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/color/RgbaInputField';
	import {
		RgbInputField,
		isRgbExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/color/RgbInputField';
	import {
		ToRgbaInputField,
		isToRgbaExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/color/ToRgbaInputField';
	import {
		InterpolateHclInputField,
		isInterpolateHclExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/curves/InterpolateHclInputField';
	import {
		InterpolateInputField,
		isInterpolateExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/curves/InterpolateInputField';
	import {
		InterpolateLabInputField,
		isInterpolateLabExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/curves/InterpolateLabInputField';
	import {
		StepInputField,
		isStepExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/curves/StepInputField';
	import {
		AllInputField,
		isAllExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/decision/AllInputField';
	import {
		AnyInputField,
		isAnyExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/decision/AnyInputField';
	import {
		CaseInputField,
		isCaseExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/decision/CaseInputField';
	import {
		CoalesceInputField,
		isCoalesceExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/decision/CoalesceInputField';
	import {
		EqualInputField,
		isEqualExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/decision/EqualInputField';
	import {
		GreaterThanInputField,
		isGreaterThanExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/decision/GreaterThanInputField';
	import {
		GreaterThanOrEqualInputField,
		isGreaterThanOrEqualExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/decision/GreaterThanOrEqualInputField';
	import {
		LessThanInputField,
		isLessThanExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/decision/LessThanInputField';
	import {
		LessThanOrEqualInputField,
		isLessThanOrEqualExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/decision/LessThanOrEqualInputField';
	import {
		MatchInputField,
		isMatchExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/decision/MatchInputField';
	import {
		NotEqualInputField,
		isNotEqualExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/decision/NotEqualInputField';
	import {
		NotInputField,
		isNotExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/decision/NotInputField';
	import {
		WithinInputField,
		isWithinExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/decision/WithinInputField';
	import {
		AccumulatedInputField,
		isAccumulatedExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/feature-data/AccumulatedInputField';
	import {
		FeatureStateInputField,
		isFeatureStateExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/feature-data/FeatureStateInputField';
	import {
		GeometryTypeInputField,
		isGeometryTypeExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/feature-data/GeometryTypeInputField';
	import {
		IdInputField,
		isIdExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/feature-data/IdInputField';
	import {
		LineProgressInputField,
		isLineProgressExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/feature-data/LineProgressInputField';
	import {
		PropertiesInputField,
		isPropertiesExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/feature-data/PropertiesInputField';
	import {
		HeatmapDensityInputField,
		isHeatmapDensityExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/heatmap/HeatmapDensity';
	import {
		AtInputField,
		isAtExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/lookup/AtInputField';
	import {
		GetInputField,
		isGetExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/lookup/GetInputField';
	import {
		HasInputField,
		isHasExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/lookup/HasInputField';
	import {
		IndexOfInputField,
		isIndexOfExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/lookup/IndexOfInputField';
	import {
		InInputField,
		isInExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/lookup/InInputField';
	import {
		LengthInputField,
		isLengthExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/lookup/LengthInputField';
	import {
		SliceInputField,
		isSliceExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/lookup/SliceInputField';
	import {
		AbsInputField,
		isAbsExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/AbsInputField';
	import {
		AcosInputField,
		isAcosExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/AcosInputField';
	import {
		AdditionInputField,
		isAdditionExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/AdditionInputField';
	import {
		AsinInputField,
		isAsinExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/AsinInputField';
	import {
		AtanInputField,
		isAtanExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/AtanInputField';
	import {
		CeilInputField,
		isCeilExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/CeilInputField';
	import {
		CosInputField,
		isCosExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/CosInputField';
	import {
		DistanceInputField,
		isDistanceExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/DistanceInputField';
	import {
		DivisionInputField,
		isDivisionExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/DivisionInputField';
	import {
		EInputField,
		isEExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/EInputField';
	import {
		FloorInputField,
		isFloorExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/FloorInputField';
	import {
		Ln2InputField,
		isLn2ExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/Ln2InputField';
	import {
		LnInputField,
		isLnExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/LnInputField';
	import {
		Log2InputField,
		isLog2ExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/Log2InputField';
	import {
		Log10InputField,
		isLog10ExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/Log10InputField';
	import {
		MaxInputField,
		isMaxExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/MaxInputField';
	import {
		MinInputField,
		isMinExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/MinInputField';
	import {
		MultiplicationInputField,
		isMultiplicationExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/MultiplicationInputField';
	import {
		PiInputField,
		isPiExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/PiInputField';
	import {
		PowerInputField,
		isPowerExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/PowerInputField';
	import {
		RemainderInputField,
		isRemainderExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/RemainderInputField';
	import {
		RoundInputField,
		isRoundExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/RoundInputField';
	import {
		SinInputField,
		isSinExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/SinInputField';
	import {
		SqrtInputField,
		isSqrtExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/SqrtInputField';
	import {
		SubtractionInputField,
		isSubtractionExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/SubtractionInputField';
	import {
		TanInputField,
		isTanExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/math/TanInputField';
	import {
		ConcatInputField,
		isConcatExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/string/ConcatInputField';
	import {
		DowncaseInputField,
		isDowncaseExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/string/DowncaseInputField';
	import {
		IsSupportedScriptInputField,
		isIsSupportedScriptExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/string/IsSupportedScriptInputField';
	import {
		ResolvedLocaleInputField,
		isResolvedLocaleExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/string/ResolvedLocaleInputField';
	import {
		UpcaseInputField,
		isUpcaseExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/string/UpcaseInputField';
	import {
		ArrayInputField,
		isArrayExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/types/ArrayInputField';
	import {
		BooleanInputField,
		isBooleanExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/types/BooleanInputField';
	import {
		CollatorInputField,
		isCollatorExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/types/CollatorInputField';
	import {
		FormatInputField,
		isFormatExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/types/FormatInputField';
	import {
		ImageInputField,
		isImageExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/types/ImageInputField';
	import {
		LiteralInputField,
		isLiteralExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/types/LiteralInputField';
	import {
		NumberFormatInputField,
		isNumberFormatExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/types/NumberFormatInputField';
	import {
		NumberInputField,
		isNumberExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/types/NumberInputField';
	import {
		ObjectInputField,
		isObjectExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/types/ObjectInputField';
	import {
		StringInputField,
		isStringExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/types/StringInputField';
	import {
		ToBooleanInputField,
		isToBooleanExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/types/ToBooleanInputField';
	import {
		ToColorInputField,
		isToColorExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/types/ToColorInputField';
	import {
		ToNumberInputField,
		isToNumberExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/types/ToNumberInputField';
	import {
		ToStringInputField,
		isToStringExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/types/ToStringInputField';
	import {
		TypeofInputField,
		isTypeofExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/types/TypeofInputField';
	import {
		LetInputField,
		isLetExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/variables/LetInputField';
	import {
		VarInputField,
		isVarExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/variables/VarInputField';
	import {
		ZoomInputField,
		isZoomExpressionSpecification
	} from '#src/components/common/FilterInputField/expressions/zoom/ZoomInputField';
	import { expressionSurface } from '#src/components/common/FilterInputField/expressions/utils/expressionSurface.ts';

	type ExpressionFieldDispatchEntry = {
		guard: (value: ExpressionSpecification) => boolean;
		acceptsZoomRange?: boolean;
		acceptsPropertySpec?: boolean;
		acceptsNested?: boolean;
		acceptsDepth?: boolean;
		// each field narrows `value` further; the guard guarantees the match at runtime
		component: unknown;
	};

	// the order MUST match the React version's if-chain (first match wins)
	const dispatchers: ExpressionFieldDispatchEntry[] = [
		{ guard: isRgbaExpressionSpecification, component: RgbaInputField },
		{ guard: isRgbExpressionSpecification, component: RgbInputField },
		{ guard: isToRgbaExpressionSpecification, component: ToRgbaInputField },
		{
			guard: isInterpolateHclExpressionSpecification,
			component: InterpolateHclInputField,
			acceptsZoomRange: true,
			acceptsPropertySpec: true
		},
		{
			guard: isInterpolateExpressionSpecification,
			component: InterpolateInputField,
			acceptsZoomRange: true,
			acceptsPropertySpec: true
		},
		{
			guard: isInterpolateLabExpressionSpecification,
			component: InterpolateLabInputField,
			acceptsZoomRange: true,
			acceptsPropertySpec: true
		},
		{
			guard: isStepExpressionSpecification,
			component: StepInputField,
			acceptsZoomRange: true,
			acceptsPropertySpec: true
		},
		{ guard: isAllExpressionSpecification, component: AllInputField },
		{ guard: isAnyExpressionSpecification, component: AnyInputField },
		{
			guard: isCaseExpressionSpecification,
			component: CaseInputField,
			acceptsPropertySpec: true,
			acceptsDepth: true
		},
		{ guard: isCoalesceExpressionSpecification, component: CoalesceInputField },
		{ guard: isEqualExpressionSpecification, component: EqualInputField },
		{ guard: isGreaterThanExpressionSpecification, component: GreaterThanInputField },
		{
			guard: isGreaterThanOrEqualExpressionSpecification,
			component: GreaterThanOrEqualInputField
		},
		{ guard: isLessThanExpressionSpecification, component: LessThanInputField },
		{ guard: isLessThanOrEqualExpressionSpecification, component: LessThanOrEqualInputField },
		{
			guard: isMatchExpressionSpecification,
			component: MatchInputField,
			acceptsPropertySpec: true,
			acceptsDepth: true
		},
		{ guard: isNotEqualExpressionSpecification, component: NotEqualInputField },
		{ guard: isNotExpressionSpecification, component: NotInputField },
		{ guard: isWithinExpressionSpecification, component: WithinInputField },
		{
			guard: isAccumulatedExpressionSpecification,
			component: AccumulatedInputField,
			acceptsNested: true
		},
		{ guard: isFeatureStateExpressionSpecification, component: FeatureStateInputField },
		{
			guard: isGeometryTypeExpressionSpecification,
			component: GeometryTypeInputField,
			acceptsNested: true
		},
		{ guard: isIdExpressionSpecification, component: IdInputField, acceptsNested: true },
		{
			guard: isLineProgressExpressionSpecification,
			component: LineProgressInputField,
			acceptsNested: true
		},
		{ guard: isPropertiesExpressionSpecification, component: PropertiesInputField },
		{
			guard: isHeatmapDensityExpressionSpecification,
			component: HeatmapDensityInputField,
			acceptsNested: true
		},
		{ guard: isAtExpressionSpecification, component: AtInputField },
		{
			guard: isGetExpressionSpecification,
			component: GetInputField,
			acceptsNested: true,
			acceptsDepth: true
		},
		{ guard: isHasExpressionSpecification, component: HasInputField },
		{ guard: isIndexOfExpressionSpecification, component: IndexOfInputField },
		{ guard: isInExpressionSpecification, component: InInputField },
		{ guard: isLengthExpressionSpecification, component: LengthInputField },
		{ guard: isSliceExpressionSpecification, component: SliceInputField },
		{ guard: isAbsExpressionSpecification, component: AbsInputField },
		{ guard: isAcosExpressionSpecification, component: AcosInputField },
		{ guard: isAdditionExpressionSpecification, component: AdditionInputField },
		{ guard: isAsinExpressionSpecification, component: AsinInputField },
		{ guard: isAtanExpressionSpecification, component: AtanInputField },
		{ guard: isCeilExpressionSpecification, component: CeilInputField },
		{ guard: isCosExpressionSpecification, component: CosInputField },
		{ guard: isDistanceExpressionSpecification, component: DistanceInputField },
		{ guard: isDivisionExpressionSpecification, component: DivisionInputField },
		{ guard: isEExpressionSpecification, component: EInputField, acceptsNested: true },
		{ guard: isFloorExpressionSpecification, component: FloorInputField },
		{ guard: isLn2ExpressionSpecification, component: Ln2InputField, acceptsNested: true },
		{ guard: isLnExpressionSpecification, component: LnInputField },
		{ guard: isLog2ExpressionSpecification, component: Log2InputField },
		{ guard: isLog10ExpressionSpecification, component: Log10InputField },
		{ guard: isMaxExpressionSpecification, component: MaxInputField },
		{ guard: isMinExpressionSpecification, component: MinInputField },
		{ guard: isMultiplicationExpressionSpecification, component: MultiplicationInputField },
		{ guard: isPiExpressionSpecification, component: PiInputField, acceptsNested: true },
		{ guard: isPowerExpressionSpecification, component: PowerInputField },
		{ guard: isRemainderExpressionSpecification, component: RemainderInputField },
		{ guard: isRoundExpressionSpecification, component: RoundInputField },
		{ guard: isSinExpressionSpecification, component: SinInputField },
		{ guard: isSqrtExpressionSpecification, component: SqrtInputField },
		{ guard: isSubtractionExpressionSpecification, component: SubtractionInputField },
		{ guard: isTanExpressionSpecification, component: TanInputField },
		{ guard: isConcatExpressionSpecification, component: ConcatInputField },
		{ guard: isDowncaseExpressionSpecification, component: DowncaseInputField },
		{
			guard: isIsSupportedScriptExpressionSpecification,
			component: IsSupportedScriptInputField
		},
		{ guard: isResolvedLocaleExpressionSpecification, component: ResolvedLocaleInputField },
		{ guard: isUpcaseExpressionSpecification, component: UpcaseInputField },
		{ guard: isArrayExpressionSpecification, component: ArrayInputField },
		{ guard: isBooleanExpressionSpecification, component: BooleanInputField },
		{ guard: isCollatorExpressionSpecification, component: CollatorInputField },
		{ guard: isFormatExpressionSpecification, component: FormatInputField },
		{ guard: isImageExpressionSpecification, component: ImageInputField },
		{ guard: isLiteralExpressionSpecification, component: LiteralInputField },
		{ guard: isNumberFormatExpressionSpecification, component: NumberFormatInputField },
		{ guard: isNumberExpressionSpecification, component: NumberInputField },
		{ guard: isObjectExpressionSpecification, component: ObjectInputField },
		{ guard: isStringExpressionSpecification, component: StringInputField },
		{ guard: isToBooleanExpressionSpecification, component: ToBooleanInputField },
		{ guard: isToColorExpressionSpecification, component: ToColorInputField },
		{ guard: isToNumberExpressionSpecification, component: ToNumberInputField },
		{ guard: isToStringExpressionSpecification, component: ToStringInputField },
		{ guard: isTypeofExpressionSpecification, component: TypeofInputField },
		{ guard: isLetExpressionSpecification, component: LetInputField },
		{ guard: isVarExpressionSpecification, component: VarInputField, acceptsNested: true },
		{ guard: isZoomExpressionSpecification, component: ZoomInputField, acceptsNested: true }
	];

	let {
		class: className,
		children,
		value,
		zoomRange,
		propertySpec,
		nested = false,
		onChange,
		...props
	}: ExpressionInputFieldProps = $props();
	const depth = useExpressionDepth();

	const entry = $derived(
		value ? dispatchers.find((dispatcher) => dispatcher.guard(value)) : undefined
	);
	const fieldProps = $derived({
		...(entry?.acceptsZoomRange ? { zoomRange } : {}),
		...(entry?.acceptsPropertySpec ? { propertySpec } : {}),
		...(entry?.acceptsNested ? { nested } : {}),
		...(entry?.acceptsDepth ? { depth } : {})
	});
	const fieldClass = $derived(cn('max-w-full text-ink-2', className));
	const fallbackClass = $derived(cn(expressionSurface(depth).className, fieldClass));
</script>

{#if value}
	{#if entry}
		{@const Field = entry.component as Component<ExpressionInputFieldProps>}
		<Field
			{...props}
			{...fieldProps}
			class={fieldClass}
			data-expression-node={nested ? 'nested' : 'root'}
			data-expression-depth={depth}
			{value}
			{onChange}
		>
			{@render children?.()}
		</Field>
	{:else}
		<div
			{...props}
			class={fallbackClass}
			data-expression-node={nested ? 'nested' : 'root'}
			data-expression-depth={depth}
		>
			{JSON.stringify(value)}
			{@render children?.()}
		</div>
	{/if}
{/if}
