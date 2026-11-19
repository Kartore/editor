import type { RequestParameters, RequestTransformFunction, ResourceType } from 'maplibre-gl';

import { GLYPH_PROTOCOL_NAME } from '../fonts/glyphProtocol.ts';

import type { EditorRequestTransformer } from './EditorModule.ts';

export type { EditorRequestTransformer };

// エディタ自身のプロトコル (ローカルフォントのグリフ) はアダプタに見せない
const internalUrlPrefixes = [`${GLYPH_PROTOCOL_NAME}://`];

const isPromiseLike = <T>(value: unknown): value is PromiseLike<T> =>
	typeof (value as PromiseLike<T> | undefined)?.then === 'function';

export type RequestTransformerRegistry = {
	register: (transformer: EditorRequestTransformer) => () => void;
	/** MapLibre の transformRequest に渡す関数。登録された関数を順に当て、最初に書き換えたものを使う */
	transform: RequestTransformFunction;
	/** transform の結果を必ず RequestParameters で返す版 (エディタ内の fetch 用) */
	resolve: (url: string, resourceType?: ResourceType) => Promise<RequestParameters>;
};

export const createRequestTransformerRegistry = (): RequestTransformerRegistry => {
	let transformers: EditorRequestTransformer[] = [];

	const run = (
		url: string,
		resourceType: ResourceType | undefined,
		from: number
	): RequestParameters | Promise<RequestParameters> | undefined => {
		for (let index = from; index < transformers.length; index += 1) {
			const result = transformers[index](url, resourceType);
			if (result === undefined) continue;
			if (!isPromiseLike<RequestParameters | undefined>(result)) return result;
			const next = index + 1;
			return Promise.resolve(result).then(
				(resolved) => resolved ?? run(url, resourceType, next) ?? { url }
			);
		}
		return undefined;
	};

	const transform: RequestTransformFunction = (url, resourceType) => {
		if (internalUrlPrefixes.some((prefix) => url.startsWith(prefix))) return undefined;
		return run(url, resourceType, 0);
	};

	return {
		register: (transformer) => {
			transformers = [...transformers, transformer];
			return () => {
				transformers = transformers.filter((candidate) => candidate !== transformer);
			};
		},
		transform,
		resolve: async (url, resourceType) => (await transform(url, resourceType)) ?? { url }
	};
};

/** エディタ自身が地図のリソース (sprite JSON・TileJSON 等) を取るときに、アダプタの書き換えを通すためのもの */
export type ResourceLoader = {
	fetch: (url: string, resourceType: ResourceType) => Promise<Response>;
	/**
	 * <img> 等にそのまま使える URL。書き換えでヘッダや credentials が要る、または fetch でしか取れない
	 * (独自スキームのまま) ときは、取ってきた中身の blob URL を返す
	 */
	imageUrl: (url: string, resourceType: ResourceType) => Promise<string>;
};

const requestInit = (parameters: RequestParameters): RequestInit => ({
	method: parameters.method,
	headers: parameters.headers,
	credentials: parameters.credentials,
	body: parameters.body,
	cache: parameters.cache,
	referrerPolicy: parameters.referrerPolicy
});

export const createResourceLoader = (
	registry: Pick<RequestTransformerRegistry, 'resolve'> | undefined,
	fetchResource: typeof globalThis.fetch = (...args) => globalThis.fetch(...args)
): ResourceLoader => {
	const resolve = (url: string, resourceType: ResourceType): Promise<RequestParameters> =>
		registry ? registry.resolve(url, resourceType) : Promise.resolve({ url });
	return {
		fetch: async (url, resourceType) => {
			const parameters = await resolve(url, resourceType);
			return fetchResource(parameters.url, requestInit(parameters));
		},
		imageUrl: async (url, resourceType) => {
			const parameters = await resolve(url, resourceType);
			const plain =
				!parameters.headers &&
				!parameters.credentials &&
				!parameters.method &&
				/^(https?|data|blob):/i.test(parameters.url);
			if (plain) return parameters.url;
			const response = await fetchResource(parameters.url, requestInit(parameters));
			if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
			return URL.createObjectURL(await response.blob());
		}
	};
};
