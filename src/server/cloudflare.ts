import { spaFallbackKind } from './core.ts';
import { base, handleKartoreRequest } from './index.ts';
import { createRuntimeBase, stringEnv, type KartoreKv } from './runtime.ts';

// @cloudflare/workers-types に依存しないための最小の構造型
type CloudflareKvNamespace = {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
	delete(key: string): Promise<void>;
};
type CloudflareExecutionContext = { waitUntil(promise: Promise<unknown>): void };
type CloudflareAssetsBinding = { fetch(request: Request | string | URL): Promise<Response> };

export type CloudflareHandlerOptions = {
	/** KartoreKv に使う KV binding 名 (既定 'KARTORE_KV')。binding が無ければ KV を使った時点でエラー */
	kvBinding?: string;
	/**
	 * SPA fallback に使う assets binding 名 (既定 'ASSETS')。wrangler.jsonc の assets に `binding` を書き、
	 * `not_found_handling: "none"` にすると、ファイルの無いパスがこの Worker に来るので、
	 * エディタ・アダプタのページには index.html を、消えたアセット (`<base>assets/…`) には 404 を返す
	 */
	assetsBinding?: string;
};

export type KartoreCloudflareHandler = {
	fetch(
		request: Request,
		env: Record<string, unknown>,
		ctx: CloudflareExecutionContext
	): Promise<Response>;
};

const isAssetsBinding = (value: unknown): value is CloudflareAssetsBinding =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as CloudflareAssetsBinding).fetch === 'function';

/**
 * API 以外でこの Worker に来たリクエスト (assets にファイルが無いパス) に応える。
 * GET / HEAD のエディタ・アダプタのページは `<base>` (index.html) を返し、それ以外は 404
 */
const spaFallback = async (
	request: Request,
	assets: CloudflareAssetsBinding | null
): Promise<Response> => {
	const url = new URL(request.url);
	if (
		assets &&
		(request.method === 'GET' || request.method === 'HEAD') &&
		spaFallbackKind(url.pathname, base) === 'index'
	) {
		// `<base>index.html` は html_handling で `<base>` へリダイレクトされるので、base そのものを取る
		const index = await assets.fetch(new Request(new URL(base, url), { headers: request.headers }));
		if (index.ok) {
			return new Response(request.method === 'HEAD' ? null : index.body, index);
		}
	}
	return new Response('Not found', { status: 404 });
};

const isKvNamespace = (value: unknown): value is CloudflareKvNamespace =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as CloudflareKvNamespace).get === 'function' &&
	typeof (value as CloudflareKvNamespace).put === 'function';

/** Cloudflare KV binding を KartoreKv に包む (TTL の切り上げ・名前空間化は runtime 側) */
export const cloudflareKv = (namespace: CloudflareKvNamespace): KartoreKv => ({
	get: (key) => namespace.get(key),
	async getJson<T = unknown>(key: string) {
		const value = await namespace.get(key);
		return value === null ? null : (JSON.parse(value) as T);
	},
	put: (key, value, options) =>
		namespace.put(
			key,
			value,
			options?.ttlSeconds === undefined ? undefined : { expirationTtl: options.ttlSeconds }
		),
	delete: (key) => namespace.delete(key)
});

const missingKv = (binding: string): KartoreKv => {
	const fail = async (): Promise<never> => {
		throw new Error(`[kartore] KV binding "${binding}" is not configured in wrangler.jsonc.`);
	};
	return { get: fail, getJson: fail, put: fail, delete: fail };
};

/**
 * Workers のエントリ。wrangler.jsonc の assets で `run_worker_first: ["<base>api/*"]` にし、静的ファイルは assets に任せる。
 * ファイルの無いパスは、`not_found_handling: "none"` と assets の `binding` ("ASSETS") で、この Worker が受ける:
 * エディタ・アダプタのページには index.html、消えたアセット (`<base>assets/…`。デプロイ前の古い HTML が指すもの) には 404。
 * (`not_found_handling: "single-page-application"` のままでも動くが、消えたアセットに index.html が返り、画面が白くなる)
 * kartore({ base: '/studio/' }) なら assets に `base_path: "/studio/"` と `run_worker_first: ["/studio/api/*"]` を書く
 * (base_path で、ビルドの出力 (dist/client) が `/studio/` の下に見える)
 *
 * ```ts
 * // worker.ts
 * export default createCloudflareHandler();
 * ```
 *
 * ```jsonc
 * // wrangler.jsonc
 * "assets": {
 *   "binding": "ASSETS",
 *   "base_path": "/studio/",
 *   "not_found_handling": "none",
 *   "run_worker_first": ["/studio/api/*"]
 * }
 * ```
 */
export const createCloudflareHandler = ({
	kvBinding = 'KARTORE_KV',
	assetsBinding = 'ASSETS'
}: CloudflareHandlerOptions = {}): KartoreCloudflareHandler => ({
	async fetch(request, env, ctx) {
		const binding = env[kvBinding];
		const kv = isKvNamespace(binding) ? cloudflareKv(binding) : missingKv(kvBinding);
		const vars = stringEnv(env);
		const response = await handleKartoreRequest(request, (request, handler) =>
			createRuntimeBase({
				request,
				env: vars,
				kv,
				waitUntil: (promise) => ctx.waitUntil(promise),
				platform: 'cloudflare',
				handlerId: handler.id,
				base
			})
		);
		if (response) return response;
		// <base>api/* 以外は run_worker_first の対象外なので、assets にファイルの無いパスだけが来る
		const assets = env[assetsBinding];
		return spaFallback(request, isAssetsBinding(assets) ? assets : null);
	}
});
