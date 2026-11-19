// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient 宣言 (非 module) をホスト側の型チェックからも辿れるようにする
/// <reference path="../typings/kartore-adapter-virtual.d.ts" />
import { adapterApiHandlers } from 'virtual:kartore-adapter/server';

import { dispatchKartoreRequest, missingEnvKeys } from './core.ts';
import type { AdapterApiHandler, RuntimeFactory } from './runtime.ts';

export type {
	AdapterApiHandler,
	KartoreKv,
	KartoreKvPutOptions,
	KartoreRuntime,
	RuntimeFactory
} from './runtime.ts';
export { createRuntimeBase, stringEnv } from './runtime.ts';

/**
 * ランタイム非依存のサーバーコア (Web 標準の fetch ハンドラ)。
 * `/api/<handler id>/...` を kartore() に登録されたアダプタへ転送し、それ以外は `null` を返す
 * (静的配信・SPA fallback はランタイム側の責務)。処理順は core.ts の dispatchKartoreRequest を参照
 */
export const handleKartoreRequest = (
	request: Request,
	createRuntime: RuntimeFactory
): Promise<Response | null> => dispatchKartoreRequest(request, createRuntime, adapterApiHandlers);

/** 登録済みの全 handler について、env に欠けている requiredEnv を返す (起動時の警告用) */
export const findMissingEnv = (
	env: Readonly<Record<string, string | undefined>>
): { id: string; keys: string[] }[] =>
	(adapterApiHandlers as readonly AdapterApiHandler[])
		.map((handler) => ({ id: handler.id, keys: missingEnvKeys(handler, env) }))
		.filter(({ keys }) => keys.length > 0);
