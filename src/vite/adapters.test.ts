import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	editorPrebundleDependencies,
	resolveHostModulePath,
	adapterHostModuleCode
} from './adapters.ts';

const root = path.resolve('/pkg/src');

describe('resolveHostModulePath', () => {
	it('resolves editor modules under src', () => {
		expect(resolveHostModulePath('components/common/Button', root)).toBe(
			path.join(root, 'components/common/Button')
		);
		expect(resolveHostModulePath('utils/styleImport.ts', root)).toBe(
			path.join(root, 'utils/styleImport.ts')
		);
	});

	it('hides runtime, build, SPA shell and entry files from adapters', () => {
		for (const hidden of [
			'server/index.ts',
			'vite/index.ts',
			'client/entry.ts',
			'index.ts',
			'types.ts'
		]) {
			expect(resolveHostModulePath(hidden, root)).toBeNull();
		}
		expect(resolveHostModulePath('../package.json', root)).toBeNull();
		expect(resolveHostModulePath('components/../server/node.ts', root)).toBeNull();
	});
});

describe('editorPrebundleDependencies', () => {
	it('pre-bundles browser dependencies of the editor, not build tools or Svelte sources', () => {
		expect(
			editorPrebundleDependencies({
				dependencies: {
					'@codemirror/state': '^6',
					'@sveltejs/vite-plugin-svelte': '^7',
					'@tailwindcss/vite': '^4',
					srvx: '1',
					'phosphor-svelte': '^3',
					'tailwind-merge': '^3'
				},
				peerDependencies: {
					'bits-ui': '^2',
					'maplibre-gl': '^6',
					svelte: '^5',
					tailwindcss: '^4',
					vite: '^8'
				}
			})
		).toEqual([
			'@kartore/editor > @codemirror/state',
			'@kartore/editor > tailwind-merge',
			'maplibre-gl'
		]);
	});
});

describe('adapter host modules', () => {
	const hostModules = new Map([
		['kartore-github-adapter', { connection: './githubConnection.ts', allowRepository: undefined }]
	]);

	it('re-exports the host module the host passed, resolved from the host root', () => {
		expect(adapterHostModuleCode('kartore-github-adapter/connection', hostModules, '/host')).toBe(
			'export { default } from "/host/githubConnection.ts";\n'
		);
	});

	it('exports undefined for keys and adapters the host did not configure', () => {
		const empty = 'export default undefined;\n';
		expect(adapterHostModuleCode('kartore-github-adapter/allowRepository', hostModules, '/h')).toBe(
			empty
		);
		expect(adapterHostModuleCode('kartore-github-adapter/other', hostModules, '/h')).toBe(empty);
		expect(adapterHostModuleCode('unknown-adapter/connection', hostModules, '/h')).toBe(empty);
	});
});
