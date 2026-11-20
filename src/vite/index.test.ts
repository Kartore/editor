import type { Plugin } from 'vite';
import { describe, expect, it } from 'vitest';

import { clientChunkGroups, kartore, packageNameOf } from './index.ts';

const appInfo = (options: Parameters<typeof kartore>[0]) => {
	const plugin = kartore(options).find(
		(entry): entry is Plugin =>
			typeof entry === 'object' &&
			entry !== null &&
			'name' in entry &&
			entry.name === 'kartore-app-info'
	);
	if (!plugin) throw new Error('kartore-app-info not found');
	type Hook = (...args: unknown[]) => unknown;
	const call = <T>(hook: unknown, ...args: unknown[]): T =>
		(typeof hook === 'function' ? (hook as Hook) : (hook as { handler: Hook }).handler).apply(
			{},
			args
		) as T;
	return {
		config: (user: Record<string, unknown> = {}) =>
			call<{ base: string }>(plugin.config, user, { command: 'serve', mode: 'development' }),
		virtualApp: () => {
			call(plugin.configResolved, { root: process.cwd() });
			return call<string>(plugin.load, '\0virtual:kartore-app');
		}
	};
};

describe('kartore({ base })', () => {
	it('defaults to / and passes it to Vite and the virtual module', () => {
		const plugin = appInfo({ runtime: 'cloudflare' });
		expect(plugin.config().base).toBe('/');
		expect(plugin.virtualApp()).toContain('export const base = "/";');
	});

	it('normalizes the sub path and exposes it', () => {
		const plugin = appInfo({ runtime: 'node', base: '/studio' });
		expect(plugin.config().base).toBe('/studio/');
		expect(plugin.virtualApp()).toContain('export const base = "/studio/";');
		expect(plugin.config({ base: '/studio/' }).base).toBe('/studio/');
	});

	it('rejects an invalid base and a conflicting Vite base', () => {
		expect(() => kartore({ runtime: 'cloudflare', base: 'studio/' })).toThrow(/\[kartore\] base/);
		expect(() =>
			appInfo({ runtime: 'cloudflare', base: '/studio/' }).config({ base: '/' })
		).toThrow(/differs from kartore\(\{ base \}\)/);
	});
});

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
		expect(group('/repo/svelte/src/app/Editor.svelte')).toBeNull();
	});
});
