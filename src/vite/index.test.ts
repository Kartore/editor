import { describe, expect, it } from 'vitest';

import { clientChunkGroups, packageNameOf } from './index.ts';

const group = (id: string) => clientChunkGroups.find(({ test }) => test(id))?.name ?? null;

describe('client chunk groups', () => {
	it('reads the package name from npm and pnpm layouts', () => {
		expect(packageNameOf('/app/node_modules/maplibre-gl/dist/maplibre-gl.mjs')).toBe('maplibre-gl');
		expect(
			packageNameOf(
				'/store/links/@/x/1/hash/node_modules/.pnpm/a/node_modules/@codemirror/view/dist/index.js'
			)
		).toBe('@codemirror/view');
		expect(packageNameOf('/repo/svelte/src/app/Editor.svelte')).toBeNull();
	});

	it('splits the big eager libraries and keeps lazy ones out of them', () => {
		expect(group('/a/node_modules/maplibre-gl/dist/maplibre-gl.mjs')).toBe('maplibre');
		expect(group('/a/node_modules/@codemirror/state/dist/index.js')).toBe('codemirror');
		expect(group('/a/node_modules/@lezer/lr/dist/index.js')).toBe('codemirror');
		expect(group('/a/node_modules/bits-ui/dist/index.js')).toBe('ui');
		expect(group('/a/node_modules/svelte/src/internal/client/index.js')).toBe('ui');
		// 後から読み込まれる style-spec / fflate や、editor 自身のソースは分けない
		expect(group('/a/node_modules/@maplibre/maplibre-gl-style-spec/dist/index.mjs')).toBeNull();
		expect(group('/a/node_modules/fflate/esm/browser.js')).toBeNull();
		expect(group('/a/node_modules/svelte-maplibre-gl/dist/index.js')).toBeNull();
		expect(group('/repo/svelte/src/app/Editor.svelte')).toBeNull();
	});
});
