import { describe, expect, it } from 'vitest';

import { createStyleExportArchiveFiles } from './styleExportArchive.ts';

describe('styleExportArchive', () => {
	it('adds relative sprite and glyph URLs when generated assets are present', () => {
		const files = createStyleExportArchiveFiles(
			{
				version: 8,
				name: 'Export test',
				sprite: 'https://example.com/sprite',
				glyphs: 'https://example.com/{fontstack}/{range}.pbf',
				sources: {},
				layers: []
			},
			'current-mode',
			{
				spriteFiles: {
					'sprite.json': '{}\n',
					'sprite.png': Uint8Array.from([1, 2, 3])
				},
				glyphFiles: {
					'Test Sans Regular/0-255.pbf': Uint8Array.from([4, 5, 6])
				}
			}
		);

		expect(JSON.parse(files['Export test.json'] as string)).toMatchObject({
			sprite: 'sprite/sprite',
			glyphs: 'glyphs/{fontstack}/{range}.pbf'
		});
		expect(files).toHaveProperty('sprite/sprite.json', '{}\n');
		expect(files['sprite/sprite.png']).toEqual(Uint8Array.from([1, 2, 3]));
		expect(files['glyphs/Test Sans Regular/0-255.pbf']).toEqual(Uint8Array.from([4, 5, 6]));
	});

	it('keeps original asset URLs when the ZIP has no generated assets', () => {
		const files = createStyleExportArchiveFiles(
			{
				version: 8,
				sprite: 'https://example.com/sprite',
				glyphs: 'https://example.com/{fontstack}/{range}.pbf',
				sources: {},
				layers: []
			},
			'current-mode'
		);

		expect(JSON.parse(files['style.json'] as string)).toMatchObject({
			sprite: 'https://example.com/sprite',
			glyphs: 'https://example.com/{fontstack}/{range}.pbf'
		});
	});
});

describe('asset hashes', () => {
	it('is deterministic, order independent and sensitive to paths and contents', async () => {
		const { hashFiles } = await import('./styleExportArchive.ts');
		const a = await hashFiles({ 'b.png': Uint8Array.from([1, 2]), 'a.json': '{}' });
		const b = await hashFiles({ 'a.json': '{}', 'b.png': Uint8Array.from([1, 2]) });
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(a).toBe(b);
		expect(await hashFiles({ 'a.json': '{}', 'c.png': Uint8Array.from([1, 2]) })).not.toBe(a);
		expect(await hashFiles({ 'a.json': '{}', 'b.png': Uint8Array.from([1, 3]) })).not.toBe(a);
		expect(await hashFiles({})).toBeNull();
	});

	it('returns empty files and null hashes without local assets', async () => {
		const { buildStyleAssetBundle } = await import('./styleExportArchive.ts');
		await expect(
			buildStyleAssetBundle({ icons: {}, fontstacks: [], getLoadedFont: async () => null })
		).resolves.toEqual({
			spriteFiles: {},
			glyphFiles: {},
			spriteHash: null,
			glyphsHash: null,
			hash: null
		});
	});
});
