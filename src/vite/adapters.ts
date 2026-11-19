import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vite';

const clientVirtualModuleId = 'virtual:kartore-adapter';
const serverVirtualModuleId = 'virtual:kartore-adapter/server';
const hostModulePrefix = 'virtual:kartore-host/';

// `virtual:kartore-host/*` の解決先 = このパッケージ自身の src (エディタの実装)。
// dist/vite.js から見た ../src。exports の "./vite" が dist/vite.js を指す前提
const editorSrcRoot = path.resolve(
	fileURLToPath(new URL(/* @vite-ignore */ '../src/', import.meta.url))
);

// src のうちアダプタに見せないもの: ランタイム・ビルド・SPA の外枠と、src 直下の公開入口 (index.ts など)。
// アダプタはこれらを @kartore/editor/* の exports から使う
const hiddenHostDirectories = new Set(['server', 'vite', 'client']);

/** `virtual:kartore-host/<path>` の解決先。アダプタに見せない場所なら null */
export const resolveHostModulePath = (hostPath: string, root = editorSrcRoot): string | null => {
	const target = path.resolve(root, hostPath);
	const relative = path.relative(root, target);
	if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
	const [first, ...rest] = relative.split(path.sep);
	if (rest.length === 0 || hiddenHostDirectories.has(first)) return null;
	return target;
};

// editor 自身と、その依存のうち Svelte ソースを配布するもの。vite-plugin-svelte はホスト root の
// package.json 直下しか自動検出しないため明示する。editor 自身を optimizeDeps.exclude に入れるのは
// 依存スキャナが virtual:kartore-adapter を解決しようとして失敗するのを防ぐためでもある
const editorSvelteDependencies = [
	'@kartore/editor',
	'bits-ui',
	'svelte-maplibre-gl',
	'phosphor-svelte',
	'@tanstack/svelte-query'
];

// editor の依存のうち、事前変換しないもの: Node で使うもの (kartore() / サーバー) と、Vite / Svelte / Tailwind 自身
const editorNonBrowserDependencies = new Set([
	'@sveltejs/vite-plugin-svelte',
	'@tailwindcss/vite',
	'srvx',
	'svelte',
	'tailwindcss',
	'vite'
]);

/**
 * dev の依存の事前変換 (optimizeDeps) に最初から入れる editor の依存。
 * editor 自身は optimizeDeps.exclude なので、Vite の依存スキャナは editor の中の import を辿らない。
 * そのままだと @codemirror/* などがページを開いてから見つかり、変換し直して 1 回リロードが走る。
 * `@kartore/editor > <dep>` の形にすると、ホストに直接の依存が無くても editor から解決される
 */
export const editorPrebundleDependencies = (
	{
		dependencies = {},
		peerDependencies = {}
	}: { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> },
	svelteDependencies: readonly string[] = editorSvelteDependencies
): string[] => {
	const browser = (name: string) =>
		!editorNonBrowserDependencies.has(name) && !svelteDependencies.includes(name);
	return [
		// 自分の依存は editor から解決する。peer (maplibre-gl など) はホストのものを使う
		...Object.keys(dependencies)
			.filter(browser)
			.map((name) => `@kartore/editor > ${name}`),
		...Object.keys(peerDependencies).filter(browser)
	].sort();
};

const readEditorDependencies = (): {
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
} => {
	try {
		return JSON.parse(readFileSync(path.join(editorSrcRoot, '..', 'package.json'), 'utf8'));
	} catch {
		return {};
	}
};

/** このバージョンの editor が要求するアダプタ契約 */
export const adapterContractVersion = 2;

type KartoreAdapterApi = {
	/** アダプタ契約のバージョン。v2 = サーバーは fetch(request, runtime)、ページは { url } prop */
	contract: number;
	/** `adapterModules` / `adapterProviders` を export するモジュール指定子 */
	clientModule: string;
	/** `adapterApiHandlers` を export するモジュール指定子 (バックエンドを持つ場合のみ) */
	serverModule?: string;
	/** optimizeDeps.exclude / ssr.noExternal に加える Svelte 系依存 */
	svelteDependencies?: string[];
};

/** アダプタが export するマニフェスト型と同じ形 (コア側で独立に定義し、特定アダプタに依存しない) */
export type KartoreAdapterVitePlugin = {
	name: string;
	api: { kartoreAdapter: KartoreAdapterApi };
};

const kartoreAdapterApi = (plugin: unknown): KartoreAdapterApi | null => {
	if (typeof plugin !== 'object' || plugin === null) return null;
	const api = (plugin as { api?: { kartoreAdapter?: unknown } }).api?.kartoreAdapter;
	if (typeof api !== 'object' || api === null) return null;
	const { clientModule } = api as Record<string, unknown>;
	if (typeof clientModule !== 'string') return null;
	return api as KartoreAdapterApi;
};

// Tailwind のルート CSS (@import 'tailwindcss' を含むもの) に editor とアダプタの @source を注入する。
// Tailwind v4 は node_modules を自動スキャンしないので、editor 自身の src もここで足す。
// @tailwindcss/vite の変換 (enforce: 'pre') より先に走る必要があるため、この plugin も pre で
// kartore() が tailwindcss() より前に並ぶことを利用する。
// スキャン対象ディレクトリは clientModule を vite 自身のリゾルバ (this.resolve) で解決して求める —
// 集約コードの import と同じ解決系を使うため、パッケージマネージャの配置 (pnpm virtual store 等) に依存しない
const tailwindSourcePlugin = (staticDirs: string[], clientModules: string[]): Plugin => {
	let sourceDirsPromise: Promise<string[]> | null = null;

	return {
		name: 'kartore-adapter-tailwind-sources',
		enforce: 'pre',
		async transform(code, id) {
			const [file] = id.split('?', 1);
			if (!file.endsWith('.css') || !/@import\s+(['"])tailwindcss\1/.test(code)) return;

			sourceDirsPromise ??= Promise.all(
				clientModules.map(async (specifier) => {
					const resolved = await this.resolve(specifier, undefined, { skipSelf: true });
					if (!resolved) {
						console.warn(`[kartore] Could not resolve ${specifier} for Tailwind @source.`);
						return [];
					}
					return [path.dirname(resolved.id.split('?', 1)[0])];
				})
			).then((dirs) => [...staticDirs, ...dirs.flat()]);

			const sources = (await sourceDirsPromise).map((dir) => {
				const relative = path.relative(path.dirname(file), dir).split(path.sep).join('/');
				return `@source ${JSON.stringify(relative)};`;
			});
			return { code: `${code}\n${sources.join('\n')}\n`, map: null };
		}
	};
};

// 各アダプタのモジュールから named export を集めて 1 本の配列に再 export するコードを生成する
const aggregateModule = (moduleIds: string[], exportNames: string[]): string => {
	const imports = moduleIds.map(
		(moduleId, index) =>
			`import { ${exportNames.map((name) => `${name} as ${name}${index}`).join(', ')} } from ${JSON.stringify(moduleId)};`
	);
	const aggregates = exportNames.map(
		(name) =>
			`export const ${name} = [${moduleIds.map((_, index) => `...${name}${index}`).join(', ')}];`
	);
	return [...imports, ...aggregates, ''].join('\n');
};

const registryPlugin = (adapters: KartoreAdapterVitePlugin[]): Plugin => {
	// 同一アダプタが二重に渡されてもモジュールが二重登録されないよう clientModule で重複排除する
	const apis = [
		...new Map(
			adapters.map(({ api }) => [api.kartoreAdapter.clientModule, api.kartoreAdapter])
		).values()
	];
	const clientIds = apis.map(({ clientModule }) => clientModule);
	const serverIds = apis.flatMap(({ serverModule }) => (serverModule ? [serverModule] : []));
	const svelteDependencies = [
		...new Set([
			...editorSvelteDependencies,
			...clientIds,
			...apis.flatMap((api) => api.svelteDependencies ?? [])
		])
	];
	const registeredIds = new Set(clientIds);
	const resolvedIds = new Map([
		[clientVirtualModuleId, '\0' + clientVirtualModuleId],
		[serverVirtualModuleId, '\0' + serverVirtualModuleId]
	]);

	return {
		name: 'kartore-adapter-registry',
		config() {
			// editor・アダプタ本体と Svelte 系依存はソースのままホスト側でコンパイルする
			return {
				optimizeDeps: {
					exclude: svelteDependencies,
					include: editorPrebundleDependencies(readEditorDependencies())
				},
				ssr: { noExternal: svelteDependencies }
			};
		},
		configResolved(config) {
			// kartore() を通さず plugins に直接置かれたアダプタは機能しない。事故防止に警告する
			for (const plugin of config.plugins) {
				const api = kartoreAdapterApi(plugin);
				if (api && !registeredIds.has(api.clientModule)) {
					console.warn(
						`[kartore] Adapter plugin "${plugin.name}" is placed outside kartore(). Pass it via kartore({ adapters: [...] }) instead.`
					);
				}
			}
		},
		async resolveId(id, importer) {
			const registryId = resolvedIds.get(id);
			if (registryId) return registryId;
			if (!id.startsWith(hostModulePrefix)) return;

			const target = resolveHostModulePath(id.slice(hostModulePrefix.length));
			if (target === null) {
				this.error(
					`[kartore] "${id}" is not part of the editor modules adapters may import ` +
						'(server / vite / client and the package entry files are not exposed).'
				);
			}
			return this.resolve(target, importer, { skipSelf: true });
		},
		load(id) {
			if (id === resolvedIds.get(clientVirtualModuleId)) {
				return aggregateModule(clientIds, ['adapterModules', 'adapterProviders']);
			}
			if (id === resolvedIds.get(serverVirtualModuleId)) {
				return aggregateModule(serverIds, ['adapterApiHandlers']);
			}
		}
	};
};

// 契約の版が違うアダプタは実行時に壊れる (fetch の引数・ページの prop が違う) ので、設定読込の時点で止める
const assertAdapterContract = (adapter: KartoreAdapterVitePlugin): void => {
	const contract = (adapter.api.kartoreAdapter as { contract?: unknown }).contract;
	if (contract === adapterContractVersion) return;
	throw new Error(
		`[kartore] Adapter "${adapter.name}" implements adapter contract ${String(contract ?? 1)}, ` +
			`but this @kartore/editor requires contract ${adapterContractVersion}. ` +
			'Update the adapter to a version built for @kartore/editor 0.1 (e.g. @kartore/file-adapter >= 0.8.0, @kartore-internal/github-adapter >= 0.10.0).'
	);
};

/**
 * アダプタの集約 (virtual:kartore-adapter[/server])・Tailwind の @source 注入・virtual:kartore-host/* の解決。
 * ホストは直接使わず、kartore() プリセット経由で使う
 */
export const kartoreAdapters = (adapters: KartoreAdapterVitePlugin[] = []): Plugin[] => {
	adapters.forEach(assertAdapterContract);
	return [
		registryPlugin(adapters),
		tailwindSourcePlugin(
			[editorSrcRoot],
			[...new Set(adapters.map(({ api }) => api.kartoreAdapter.clientModule))]
		),
		...adapters
	];
};
