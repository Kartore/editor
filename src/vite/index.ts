import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin, PluginOption, ViteDevServer } from 'vite';

import { kartoreAdapters, type KartoreAdapterVitePlugin } from './adapters.ts';

export { adapterContractVersion, type KartoreAdapterVitePlugin } from './adapters.ts';

// ホストの index.html に注入するクライアントエントリの URL
const clientEntryUrl = '/@kartore/client';
const appInfoId = 'virtual:kartore-app';
const storageConfigId = 'virtual:kartore-storage';

// dist/vite.js から見た ../src
const editorSrcRoot = path.resolve(
	fileURLToPath(new URL(/* @vite-ignore */ '../src/', import.meta.url))
);
const clientEntry = path.join(editorSrcRoot, 'client/entry.ts');
const nodeRuntimeEntry = path.join(editorSrcRoot, 'server/node.ts');

export type KartoreOptions = {
	adapters?: KartoreAdapterVitePlugin[];
	/**
	 * サーバー (/api/*) を動かすランタイム。
	 * - `'cloudflare'`: dev / preview の /api は @cloudflare/vite-plugin (workerd) が受け持つ。plugins に cloudflare() を並べること
	 * - `'node'`: dev では Vite のミドルウェアがサーバーコアを直接呼ぶ。本番は nodeServer のエントリ
	 */
	runtime: 'cloudflare' | 'node';
	/**
	 * runtime: 'node' のとき、dev ミドルウェアと本番サーバーが共有する設定モジュール (ホスト root 相対)。
	 * default export は `NodeRuntimeConfig` (`@kartore/editor/server/node`)。省略時は process.env + memoryKv()
	 */
	nodeConfig?: string;
	/**
	 * runtime: 'node' のとき、本番サーバーのエントリ (ホスト root 相対)。
	 * 指定すると `vite build` 1 回で client (dist/client) と server (dist/server) を両方ビルドする
	 */
	nodeServer?: string;
	/**
	 * runtime: 'node' + nodeServer のときの出力先 (ホスト root 相対、既定 'dist')。client は `<nodeOutDir>/client`、server は `<nodeOutDir>/server`。
	 * 同じホストで Cloudflare 用のビルドもするなら、出力が重ならないよう別にする
	 */
	nodeOutDir?: string;
	/**
	 * 手元の保存のしかたを差し替えるモジュール (ホスト root 相対)。default export は `KartoreStorageConfig`
	 * (`@kartore/editor/storage`): `{ storage?: EditorStorage; scope?: string | null | (() => …) }`。
	 * 省略時は今までと同じ保存先 (スコープ無し)
	 */
	storage?: string;
};

// SvelteKit 前提のモジュールは editor の上では動かない。アダプタが import していたら分かる形で止める
const forbiddenImportPattern = /^(\$app\/|\$env\/|\$lib(\/|$)|@sveltejs\/kit(\/|$))/;

const forbidSvelteKitPlugin = (): Plugin => ({
	name: 'kartore-forbid-sveltekit',
	enforce: 'pre',
	resolveId(id, importer) {
		if (!forbiddenImportPattern.test(id)) return;
		this.error(
			`[kartore] "${id}" is imported from ${importer ?? 'an unknown module'}. ` +
				'Kartore hosts do not run SvelteKit: adapter pages receive the current URL as the `url` prop, ' +
				'and server handlers receive env / KV through the KartoreRuntime argument.'
		);
	}
});

const appInfoPlugin = (storage: string | undefined): Plugin => {
	let appVersion = '0.0.0';
	let root = process.cwd();
	return {
		name: 'kartore-app-info',
		config() {
			// editor とアダプタで共有するライブラリはホスト root の 1 系統に寄せる
			// (pnpm link 時、editor 側の node_modules から別インスタンスが解決されるのを防ぐ)
			return {
				resolve: {
					dedupe: ['svelte', 'bits-ui', '@tanstack/svelte-query', 'phosphor-svelte', 'maplibre-gl']
				}
			};
		},
		configResolved(config) {
			const pkg = JSON.parse(readFileSync(path.join(config.root, 'package.json'), 'utf8')) as {
				version?: string;
			};
			appVersion = pkg.version ?? appVersion;
			root = config.root;
		},
		resolveId(id) {
			if (id === appInfoId) return '\0' + appInfoId;
			if (id === storageConfigId) return '\0' + storageConfigId;
			if (id === clientEntryUrl) return clientEntry;
		},
		// ホストの index.html にはスクリプトを書かせず、editor のエントリをここで差し込む
		transformIndexHtml: {
			order: 'pre',
			handler: () => [
				{ tag: 'script', attrs: { type: 'module', src: clientEntryUrl }, injectTo: 'body' }
			]
		},
		load(id) {
			if (id === '\0' + appInfoId)
				return `export const appVersion = ${JSON.stringify(appVersion)};`;
			if (id === '\0' + storageConfigId)
				return storage
					? `export { default } from ${JSON.stringify(path.resolve(root, storage))};`
					: 'export default undefined;';
		}
	};
};

// src/server を型でも辿らない (dist/vite.d.ts に server の宣言を引き込まないため)。node.ts / index.ts の export と揃えること
type NodeRuntimeConfig = { env?: Record<string, string | undefined>; kv?: unknown };
type RuntimeFactory = (request: Request, handler: unknown) => unknown;
type NodeRuntimeModule = {
	warnMissingEnv(env: Record<string, string | undefined>): void;
	createWaitUntil(): { waitUntil(promise: Promise<unknown>): void };
	createNodeRuntimeFactory(
		config: NodeRuntimeConfig,
		waitUntil: (promise: Promise<unknown>) => void
	): RuntimeFactory;
};
type ServerCoreModule = {
	handleKartoreRequest(request: Request, createRuntime: RuntimeFactory): Promise<Response | null>;
};

// runtime: 'node' の dev: /api/* を Vite のミドルウェアで受け、本番と同じ nodeConfig から runtime を作る
const nodeDevApiPlugin = (nodeConfig: string | undefined): Plugin => ({
	name: 'kartore-node-dev-api',
	apply: 'serve',
	async configureServer(server: ViteDevServer) {
		const { toNodeHandler } = await import('srvx/node');
		let ready: Promise<{ handle: (request: Request) => Promise<Response | null> }> | null = null;

		// ssrLoadModule は同じモジュールインスタンスを返すので、KV 等は dev サーバーの寿命の間保たれる
		const setup = async () => {
			const runtime = (await server.ssrLoadModule(nodeRuntimeEntry)) as NodeRuntimeModule;
			const config = nodeConfig
				? (
						(await server.ssrLoadModule(path.resolve(server.config.root, nodeConfig))) as {
							default: NodeRuntimeConfig;
						}
					).default
				: {};
			const env = config.env ?? process.env;
			runtime.warnMissingEnv(env);
			const { waitUntil } = runtime.createWaitUntil();
			const createRuntime = runtime.createNodeRuntimeFactory({ ...config, env }, waitUntil);
			const core = (await server.ssrLoadModule(
				path.join(editorSrcRoot, 'server/index.ts')
			)) as ServerCoreModule;
			return { handle: (request: Request) => core.handleKartoreRequest(request, createRuntime) };
		};

		const handler = toNodeHandler(async (request: Request) => {
			const { handle } = await (ready ??= setup());
			return (await handle(request)) ?? new Response('Not found', { status: 404 });
		});
		server.middlewares.use((req, res, next) => {
			if (!req.url?.startsWith('/api/')) return next();
			// srvx の NodeHttpHandler は http / http2 両対応の交差型を取るため、Connect の req / res を渡すには型を潰す
			void handler(req as never, res as never);
		});
	}
});

/** モジュールの id (パス) が属するパッケージ名。node_modules の外なら null (pnpm の .pnpm / グローバルストアでも最後の node_modules を見る) */
export const packageNameOf = (id: string): string | null => {
	const parts = id.split(/[\\/]node_modules[\\/]/);
	if (parts.length < 2) return null;
	const [first, second] = parts[parts.length - 1].split(/[\\/]/);
	return first.startsWith('@') ? `${first}/${second}` : first;
};

/** パッケージ名の一覧 (`@scope/*` はスコープ全体) に入るモジュールか */
const inPackages =
	(names: readonly string[]) =>
	(id: string): boolean => {
		const name = packageNameOf(id);
		if (name === null) return false;
		return names.some((pattern) =>
			pattern.endsWith('/*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern
		);
	};

/**
 * クライアントのチャンク分割。最初の表示に要る大きなライブラリを別ファイルにして、キャッシュを効きやすくする。
 * 後から読み込むもの (style-spec / fflate・glyphore / spritore) を最初のチャンクに混ぜないよう、
 * node_modules 全体ではなく名前を挙げたものだけを分ける
 */
export const clientChunkGroups = [
	{ name: 'maplibre', test: inPackages(['maplibre-gl']), priority: 30 },
	{
		// 遅延読み込みされる CodeEditor / StyleJsonPanel からだけ使われる
		name: 'codemirror',
		test: inPackages(['@codemirror/*', '@lezer/*', 'crelt', 'style-mod', 'w3c-keyname']),
		priority: 20
	},
	{
		name: 'ui',
		test: inPackages([
			'svelte',
			'bits-ui',
			'svelte-toolbelt',
			'runed',
			'@floating-ui/*',
			'tabbable',
			'phosphor-svelte',
			'tailwind-merge',
			'clsx',
			'@tanstack/*',
			'@internationalized/*'
		]),
		priority: 10
	}
];

const clientChunksPlugin = (): Plugin => ({
	name: 'kartore-client-chunks',
	apply: 'build',
	configEnvironment(name) {
		if (name !== 'client') return;
		return {
			build: {
				// maplibre-gl は単体で 800 kB ほどあり分けられない
				chunkSizeWarningLimit: 1024,
				rolldownOptions: { output: { codeSplitting: { groups: clientChunkGroups } } }
			}
		};
	}
});

// runtime: 'node' + nodeServer: `vite build` 1 回で client と server をビルドする
const nodeBuildPlugin = (nodeServer: string, outDir: string): Plugin => ({
	name: 'kartore-node-build',
	apply: 'build',
	config() {
		return {
			builder: {},
			environments: {
				client: { build: { outDir: `${outDir}/client` } },
				ssr: {
					build: {
						outDir: `${outDir}/server`,
						ssr: nodeServer,
						copyPublicDir: false,
						emptyOutDir: true
					}
				}
			}
		};
	}
});

/**
 * Kartore のホスト用 Vite プリセット。アダプタ登録・Tailwind・Svelte・クライアントエントリの注入・
 * ランタイム (Cloudflare / Node) の dev / build 設定をまとめて返す
 *
 * ```ts
 * // Cloudflare
 * plugins: [kartore({ adapters: [fileAdapter()], runtime: 'cloudflare' }), cloudflare()]
 * // Node
 * plugins: [kartore({ adapters: [fileAdapter()], runtime: 'node', nodeConfig: './kartore.node.ts', nodeServer: './server.node.ts' })]
 * ```
 */
export const kartore = ({
	adapters = [],
	runtime,
	nodeConfig,
	nodeServer,
	nodeOutDir = 'dist',
	storage
}: KartoreOptions): PluginOption[] => [
	forbidSvelteKitPlugin(),
	appInfoPlugin(storage),
	clientChunksPlugin(),
	// kartoreAdapters() (Tailwind @source 注入を含む) は tailwindcss() より前
	...kartoreAdapters(adapters),
	tailwindcss(),
	svelte({
		compilerOptions: {
			// @kartore/* と @kartore-internal/* は source 配布なので runes を強制する。他の node_modules は推論に任せる
			runes: ({ filename }) => {
				const parts = filename.split(/[/\\]/);
				if (!parts.includes('node_modules')) return true;
				return parts.includes('@kartore') || parts.includes('@kartore-internal') ? true : undefined;
			},
			experimental: { async: true }
		}
	}),
	runtime === 'node' ? nodeDevApiPlugin(nodeConfig) : null,
	runtime === 'node' && nodeServer ? nodeBuildPlugin(nodeServer, nodeOutDir) : null
];
