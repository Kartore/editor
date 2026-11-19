import { base, handleKartoreRequest } from './index.ts';
import { createRuntimeBase, stringEnv, type KartoreKv } from './runtime.ts';

// @cloudflare/workers-types に依存しないための最小の構造型
type CloudflareKvNamespace = {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
	delete(key: string): Promise<void>;
};
type CloudflareExecutionContext = { waitUntil(promise: Promise<unknown>): void };

export type CloudflareHandlerOptions = {
	/** KartoreKv に使う KV binding 名 (既定 'KARTORE_KV')。binding が無ければ KV を使った時点でエラー */
	kvBinding?: string;
};

export type KartoreCloudflareHandler = {
	fetch(
		request: Request,
		env: Record<string, unknown>,
		ctx: CloudflareExecutionContext
	): Promise<Response>;
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
 * Workers のエントリ。wrangler.jsonc の assets で `run_worker_first: ["<base>api/*"]` にし、
 * 静的ファイルと SPA fallback は assets に任せる前提。
 * kartore({ base: '/studio/' }) なら assets に `base_path: "/studio/"` と `run_worker_first: ["/studio/api/*"]` を書く
 * (base_path で、ビルドの出力 (dist/client) が `/studio/` の下に見え、SPA fallback も `/studio/` の下だけで効く)
 *
 * ```ts
 * // worker.ts
 * export default createCloudflareHandler();
 * ```
 *
 * ```jsonc
 * // wrangler.jsonc
 * "assets": {
 *   "base_path": "/studio/",
 *   "not_found_handling": "single-page-application",
 *   "run_worker_first": ["/studio/api/*"]
 * }
 * ```
 */
export const createCloudflareHandler = ({
	kvBinding = 'KARTORE_KV'
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
		// <base>api/* 以外は run_worker_first の対象外なので、assets に無いパス (base の外) だけが来る
		return response ?? new Response('Not found', { status: 404 });
	}
});
