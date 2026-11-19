import 'fake-indexeddb/auto';

import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';

import { createIndexedDbEditorStorage } from './indexedDbStorage.ts';
import { listUnsavedDrafts } from './meta.ts';

const style = (name: string): StyleSpecification => ({ version: 8, name, sources: {}, layers: [] });
const font = (familyName: string) => ({
	familyName,
	styleName: 'Regular',
	addedAt: 1,
	bytes: Uint8Array.from([1, 2, 3]).buffer
});

let databaseIndex = 0;
const createStorage = () =>
	createIndexedDbEditorStorage({ databaseName: `kartore-drafts-test-${databaseIndex++}` });

describe('createIndexedDbEditorStorage', () => {
	it('keeps style, icons, fonts and meta separate per scope', async () => {
		const storage = createStorage();
		const a = storage.open('prod:u1:o1:a');
		const b = storage.open('prod:u1:o1:b');
		await a.style.save(style('A'));
		await a.icons.save({ pin: '<svg/>' });
		await a.fonts.save('A Regular', font('A'));
		await b.fonts.save('B Regular', font('B'));
		await a.meta.save({
			editedAt: 10,
			savedAt: null,
			saved: false,
			adapters: { cloudmap: { base: 3 } }
		});

		expect(await a.style.load()).toMatchObject({ name: 'A' });
		expect(await b.style.load()).toBeNull();
		expect(await a.icons.load()).toEqual({ pin: '<svg/>' });
		expect(await b.icons.load()).toBeNull();
		expect(Object.keys((await a.fonts.load()) ?? {})).toEqual(['A Regular']);
		expect(Object.keys((await b.fonts.load()) ?? {})).toEqual(['B Regular']);
		expect((await a.fonts.get('A Regular'))?.familyName).toBe('A');
		expect(await b.fonts.get('A Regular')).toBeNull();
		expect(await a.meta.load()).toMatchObject({ adapters: { cloudmap: { base: 3 } } });
	});

	it('clears one scope only', async () => {
		const storage = createStorage();
		const a = storage.open('a');
		const b = storage.open('b');
		await Promise.all([a.style.save(style('A')), b.style.save(style('B'))]);
		await a.fonts.save('X', font('X'));
		await b.fonts.save('X', font('X'));
		await a.meta.save({ editedAt: 1, savedAt: null, saved: false, adapters: {} });
		await a.clear();
		expect(await a.style.load()).toBeNull();
		expect(await a.meta.load()).toBeNull();
		expect(await a.fonts.load()).toEqual({});
		expect(await b.style.load()).toMatchObject({ name: 'B' });
		expect(Object.keys((await b.fonts.load()) ?? {})).toEqual(['X']);
	});

	it('lists drafts with unsaved edits, newest first, excluding the unscoped draft', async () => {
		const storage = createStorage();
		await storage.open('old').meta.save({ editedAt: 1, savedAt: null, saved: false, adapters: {} });
		await storage.open('new').meta.save({ editedAt: 5, savedAt: null, saved: false, adapters: {} });
		await storage.open('saved').meta.save({ editedAt: 9, savedAt: 9, saved: true, adapters: {} });
		await storage.open(null).meta.save({ editedAt: 7, savedAt: null, saved: false, adapters: {} });

		expect((await storage.listDrafts()).map(({ scope }) => scope).sort()).toEqual([
			'new',
			'old',
			'saved'
		]);
		expect((await listUnsavedDrafts(storage)).map(({ scope }) => scope)).toEqual(['new', 'old']);
	});
});
