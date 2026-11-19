/**
 * アダプタのサーバー契約 v2。ランタイム (Cloudflare / Node …) に依存しない。
 * アダプタはここの型を `import type { … } from '@kartore/editor/server'` で使う
 */

/** ランタイムがアダプタに渡すもの。Cloudflare の env / ExecutionContext の代わり */
export type KartoreRuntime = {
	/** secrets / vars。文字列だけ (Cloudflare の bindings オブジェクトは入らない) */
	readonly env: Readonly<Record<string, string | undefined>>;
	/** アダプタ専用 KV。キーは自動で `<adapter id>:` が前置される */
	readonly kv: KartoreKv;
	/** レスポンス返却後も続けたい処理。Cloudflare は ctx.waitUntil、Node は promise を保持してエラーをログ */
	waitUntil(promise: Promise<unknown>): void;
	/** 公開 origin (末尾 / なし)。PUBLIC_ORIGIN があればそれ、無ければ request の origin */
	readonly origin: string;
	/** origin が https か。cookie の secure 属性に使う */
	readonly secure: boolean;
	/** 実行中のランタイム名。分岐は最小限にすること */
	readonly platform: 'cloudflare' | 'node' | (string & {});
};

export type KartoreKvPutOptions = {
	/** 有効期限 (秒)。Cloudflare KV の制約に合わせ、60 未満は 60 に切り上げる */
	ttlSeconds?: number;
};

export type KartoreKv = {
	get(key: string): Promise<string | null>;
	getJson<T = unknown>(key: string): Promise<T | null>;
	/** ttlSeconds は Cloudflare KV の制約で 60 未満は 60 に切り上げる (全ランタイムで同じ挙動に揃える) */
	put(key: string, value: string, options?: KartoreKvPutOptions): Promise<void>;
	delete(key: string): Promise<void>;
};

export type AdapterApiHandler = {
	/** `/api/<id>/...` の id。マニフェストの名前空間と一致させる */
	id: string;
	/** 必須の env キー。欠けていれば handler を呼ばずに 500 `{ error: 'missing_env', keys }` */
	requiredEnv?: readonly string[];
	optionalEnv?: readonly string[];
	fetch(request: Request, runtime: KartoreRuntime): Response | Promise<Response>;
};

/** server core がアダプタごとに runtime を作るための関数。ランタイム実装が用意する */
export type RuntimeFactory = (request: Request, handler: AdapterApiHandler) => KartoreRuntime;

/** Cloudflare KV の最小 TTL (秒) */
export const minimumKvTtlSeconds = 60;

export const normalizeTtlSeconds = (ttlSeconds: number | undefined): number | undefined =>
	ttlSeconds === undefined ? undefined : Math.max(minimumKvTtlSeconds, Math.ceil(ttlSeconds));

/** 素の KV をアダプタ用に包む: キーに `<prefix>:` を前置し、TTL を揃え、getJson を get から作る */
export const namespacedKv = (kv: KartoreKv, prefix: string): KartoreKv => {
	const scoped = (key: string) => `${prefix}:${key}`;
	return {
		get: (key) => kv.get(scoped(key)),
		async getJson<T = unknown>(key: string) {
			const value = await kv.get(scoped(key));
			return value === null ? null : (JSON.parse(value) as T);
		},
		put: (key, value, options) =>
			kv.put(scoped(key), value, { ttlSeconds: normalizeTtlSeconds(options?.ttlSeconds) }),
		delete: (key) => kv.delete(scoped(key))
	};
};

/** 公開 origin と secure を決める。PUBLIC_ORIGIN があればそれ (末尾 / を除く)、無ければ request の origin */
export const resolvePublicOrigin = (
	request: Request,
	env: Readonly<Record<string, string | undefined>>
): { origin: string; secure: boolean } => {
	const configured = env.PUBLIC_ORIGIN?.trim().replace(/\/+$/, '');
	const origin = configured || new URL(request.url).origin;
	return { origin, secure: origin.startsWith('https:') };
};

/** env のうち文字列の値だけを取り出す (Cloudflare の bindings オブジェクトなどを除く) */
export const stringEnv = (env: Record<string, unknown>): Record<string, string | undefined> =>
	Object.fromEntries(
		Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
	);

/** 各ランタイムの createRuntime の共通部分 */
export const createRuntimeBase = ({
	request,
	env,
	kv,
	waitUntil,
	platform,
	handlerId
}: {
	request: Request;
	env: Readonly<Record<string, string | undefined>>;
	kv: KartoreKv;
	waitUntil: (promise: Promise<unknown>) => void;
	platform: KartoreRuntime['platform'];
	handlerId: string;
}): KartoreRuntime => {
	const { origin, secure } = resolvePublicOrigin(request, env);
	return {
		env: Object.freeze({ ...env }),
		kv: namespacedKv(kv, handlerId),
		waitUntil,
		origin,
		secure,
		platform
	};
};
