import { getContext, setContext } from 'svelte';

import {
	createResourceLoader,
	type RequestTransformerRegistry,
	type ResourceLoader
} from '#src/editor/requestTransform.ts';

const KEY = Symbol('request-transform');

export const provideRequestTransform = (
	registry: RequestTransformerRegistry
): RequestTransformerRegistry => setContext(KEY, registry);

/** Editor の外 (単体のテスト等) では undefined */
export const useRequestTransform = (): RequestTransformerRegistry | undefined => getContext(KEY);

/** エディタ内の fetch にアダプタの書き換えを当てる。コンポーネントの初期化中に呼ぶこと */
export const useResourceLoader = (): ResourceLoader => createResourceLoader(useRequestTransform());
