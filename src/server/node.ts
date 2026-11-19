/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { serve, type Server } from 'srvx';
import { staticMiddleware } from 'srvx/static';

import { findMissingEnv, handleKartoreRequest } from './index.ts';
import { memoryKv } from './kv.ts';
import { createRuntimeBase, type KartoreKv, type RuntimeFactory } from './runtime.ts';

/** dev (Vite のミドルウェア) と本番 (startNodeServer) で共有する Node の設定。kartore({ nodeConfig }) の default export */
export type NodeRuntimeConfig = {
	/** アダプタに渡す env。既定 process.env */
	env?: Record<string, string | undefined>;
	/** 既定 memoryKv() */
	kv?: KartoreKv;
};

export type NodeServerOptions = NodeRuntimeConfig & {
	/** vite build の client 出力 (index.html と assets) */
	clientDir: string | URL;
	/** 既定 process.env.PORT ?? 3000 */
	port?: number;
	hostname?: string;
};

/** 未完了の waitUntil を保持し、reject はログに出す (srvx の server.waitUntil が無い dev 用) */
export const createWaitUntil = () => {
	const pending = new Set<Promise<unknown>>();
	return {
		waitUntil(promise: Promise<unknown>) {
			const tracked = promise
				.catch((error: unknown) => console.error('[kartore] waitUntil rejected:', error))
				.finally(() => pending.delete(tracked));
			pending.add(tracked);
		},
		settle: () => Promise.all(pending)
	};
};

export const createNodeRuntimeFactory = (
	{ env = process.env, kv = memoryKv() }: NodeRuntimeConfig,
	waitUntil: (promise: Promise<unknown>) => void
): RuntimeFactory => {
	return (request, handler) =>
		createRuntimeBase({ request, env, kv, waitUntil, platform: 'node', handlerId: handler.id });
};

export const warnMissingEnv = (env: Record<string, string | undefined>): void => {
	for (const { id, keys } of findMissingEnv(env)) {
		console.warn(`[kartore] Adapter "${id}" is missing env: ${keys.join(', ')}`);
	}
};

/**
 * Node の本番サーバー (srvx)。静的ファイル → /api/* → SPA fallback (index.html) の順に処理する
 *
 * ```ts
 * // server.node.ts
 * startNodeServer({ ...config, clientDir: new URL('../client/', import.meta.url) });
 * ```
 */
export const startNodeServer = ({
	clientDir,
	env = process.env,
	kv = memoryKv(),
	port = Number(process.env.PORT ?? 3000),
	hostname
}: NodeServerOptions): Server => {
	const dir = typeof clientDir === 'string' ? clientDir : fileURLToPath(clientDir);
	const indexHtml = readFileSync(
		new URL('index.html', `file://${dir.replace(/\/?$/, '/')}`),
		'utf8'
	);
	warnMissingEnv(env);

	const fallback = createWaitUntil();
	// server は下の serve() の戻り値。runtime が作られるのはリクエスト処理中なので初期化済み
	const createRuntime = createNodeRuntimeFactory({ env, kv }, (promise) =>
		(server.waitUntil ?? fallback.waitUntil)(promise)
	);

	const server = serve({
		port,
		hostname,
		// SIGTERM / SIGINT で未完了の waitUntil を含め最大 10 秒待つ
		gracefulShutdown: { gracefulTimeout: 10 },
		middleware: [staticMiddleware({ dir })],
		async fetch(request) {
			const response = await handleKartoreRequest(request, createRuntime);
			if (response) return response;
			// SPA fallback (Workers の not_found_handling: single-page-application 相当)
			return new Response(indexHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } });
		}
	});
	return server;
};
