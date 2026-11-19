import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';

import { FontsStore } from '../../stores/fonts/fontsStore.svelte.ts';
import type { StoredFont } from '../../stores/fonts/FontsStoreAdapter.ts';
import { MapStyleStore } from '../../stores/mapStyle/mapStyleStore.svelte.ts';
import { SpriteIconsStore } from '../../stores/spriteIcons/spriteIconsStore.svelte.ts';

import { LocalDraftSession } from './localDraftSession.svelte.ts';
import type { EditorStorage, LocalDraftMeta, LocalDraftStore } from './types.ts';

const style = (name: string): StyleSpecification => ({ version: 8, name, sources: {}, layers: [] });

/** スコープごとに Map に置くだけのストレージ */
const memoryStorage = (confirmUnsaved = true) => {
	const scopes = new Map<
		string | null,
		{
			style?: StyleSpecification;
			icons?: Record<string, string>;
			fonts: Map<string, StoredFont>;
			meta?: LocalDraftMeta;
		}
	>();
	const entry = (scope: string | null) => {
		if (!scopes.has(scope)) scopes.set(scope, { fonts: new Map() });
		return scopes.get(scope)!;
	};
	const storage: EditorStorage = {
		id: 'memory',
		confirmUnsaved,
		open: (scope): LocalDraftStore => ({
			style: {
				id: 'memory',
				load: async () => structuredClone(entry(scope).style ?? null),
				save: async (value) => void (entry(scope).style = structuredClone(value))
			},
			icons: {
				id: 'memory',
				load: async () => entry(scope).icons ?? null,
				save: async (value) => void (entry(scope).icons = { ...value })
			},
			fonts: {
				id: 'memory',
				load: async () =>
					Object.fromEntries(
						[...entry(scope).fonts].map(([name, { familyName, styleName, addedAt }]) => [
							name,
							{ familyName, styleName, addedAt }
						])
					),
				get: async (name) => entry(scope).fonts.get(name) ?? null,
				save: async (name, font) => void entry(scope).fonts.set(name, font),
				remove: async (name) => void entry(scope).fonts.delete(name)
			},
			meta: {
				load: async () => structuredClone(entry(scope).meta ?? null),
				save: async (meta) => void (entry(scope).meta = structuredClone(meta))
			},
			clear: async () => void scopes.delete(scope)
		}),
		listDrafts: async () =>
			[...scopes].flatMap(([scope, { meta }]) => (scope !== null && meta ? [{ scope, meta }] : []))
	};
	return { storage, scopes, entry };
};

const createEditor = (storage: EditorStorage, scope: string | null, now = () => 1_000) => {
	const session = new LocalDraftSession({ storage, scope, now });
	const draft = session.initialDraft;
	const stores = {
		style: new MapStyleStore({
			adapter: draft.style,
			initialStyle: style('empty'),
			onChange: session.markChanged
		}),
		icons: new SpriteIconsStore({ adapter: draft.icons, onChange: session.markChanged }),
		fonts: new FontsStore({ adapter: draft.fonts, onChange: session.markChanged }),
		initialStyle: () => style('empty')
	};
	return { session, stores, opened: session.start(stores) };
};

describe('LocalDraftSession', () => {
	it('opens an empty scope, records edits and saves', async () => {
		const { storage, entry } = memoryStorage();
		let now = 1_000;
		const { session, stores, opened } = createEditor(storage, 'a', () => now);
		expect(session.opening).toBe(true);
		await expect(opened).resolves.toMatchObject({ scope: 'a', draft: 'none' });
		expect(session.opening).toBe(false);
		expect(session.hasUnsavedEdits).toBe(false);

		now = 2_000;
		stores.style.setMapStyle(style('edited'));
		expect(session.meta).toMatchObject({ editedAt: 2_000, saved: false });
		expect(session.hasUnsavedEdits).toBe(true);
		session.setAdapterData('cloudmap', { base: 3 });

		now = 3_000;
		await session.markSaved({ github: { branch: 'main', commit: 'abc' } });
		expect(entry('a').meta).toEqual({
			editedAt: 2_000,
			savedAt: 3_000,
			saved: true,
			adapters: { cloudmap: { base: 3 }, github: { branch: 'main', commit: 'abc' } }
		});
		expect(session.hasUnsavedEdits).toBe(false);
		stores.style.flushSave();
	});

	it('asks to recover unsaved edits and keeps them when recovered', async () => {
		const { storage, entry } = memoryStorage();
		entry('a').style = style('local draft');
		entry('a').meta = {
			editedAt: 500,
			savedAt: null,
			saved: false,
			adapters: { cloudmap: { base: 2 } }
		};

		const { session, stores, opened } = createEditor(storage, 'a');
		session.registerInspector(async ({ meta }) => ({
			base: `rev ${(meta.adapters.cloudmap as { base: number }).base}`,
			warnings: ['A newer draft exists on the server.']
		}));
		await vi.waitFor(() => expect(session.recovery?.inspecting).toBe(false));
		expect(session.recovery).toMatchObject({
			scope: 'a',
			meta: { editedAt: 500 },
			inspections: [{ base: 'rev 2', warnings: ['A newer draft exists on the server.'] }]
		});
		expect(stores.style.mapStyle.name).toBe('local draft');

		session.resolveRecovery('restore');
		await expect(opened).resolves.toMatchObject({ draft: 'restored' });
		expect(session.recovery).toBeNull();
		expect(session.hasUnsavedEdits).toBe(true);
		expect(stores.style.mapStyle.name).toBe('local draft');
	});

	it('discards unsaved edits and opens the scope empty', async () => {
		const { storage, entry, scopes } = memoryStorage();
		entry('a').style = style('local draft');
		entry('a').icons = { pin: '<svg/>' };
		entry('a').meta = { editedAt: 500, savedAt: null, saved: false, adapters: {} };

		const { session, stores, opened } = createEditor(storage, 'a');
		await vi.waitFor(() => expect(session.recovery).not.toBeNull());
		session.resolveRecovery('discard');
		await expect(opened).resolves.toMatchObject({ draft: 'discarded' });
		expect(stores.style.mapStyle.name).toBe('empty');
		expect(stores.icons.icons).toEqual({});
		expect(session.meta).toMatchObject({ editedAt: null, saved: true });
		expect(scopes.get('a')?.style).toBeUndefined();
	});

	it('does not ask when the storage does not confirm unsaved edits', async () => {
		const { storage, entry } = memoryStorage(false);
		entry(null).meta = { editedAt: 500, savedAt: null, saved: false, adapters: {} };
		const { session, opened } = createEditor(storage, null);
		await expect(opened).resolves.toMatchObject({ draft: 'none' });
		expect(session.hasUnsavedEdits).toBe(true);
	});

	it('switches scopes: writes the old scope, then reads the new one', async () => {
		const { storage, entry } = memoryStorage();
		entry('b').style = style('B');
		entry('b').icons = { b: '<svg/>' };
		const { session, stores, opened } = createEditor(storage, 'a');
		await opened;
		const listener = vi.fn();
		session.onOpened(listener);
		await vi.waitFor(() =>
			expect(listener).toHaveBeenCalledWith(expect.objectContaining({ scope: 'a' }))
		);

		stores.style.setMapStyle(style('A edited'));
		await expect(session.open('b')).resolves.toMatchObject({ scope: 'b', draft: 'none' });
		expect(entry('a').style?.name).toBe('A edited');
		expect(entry('a').meta).toMatchObject({ saved: false });
		expect(session.scope).toBe('b');
		expect(stores.style.mapStyle.name).toBe('B');
		expect(stores.icons.icons).toEqual({ b: '<svg/>' });
		expect(stores.style.canUndo).toBe(false);
		expect(session.hasUnsavedEdits).toBe(false);
		expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'b' }));

		await expect(session.listUnsavedDrafts()).resolves.toEqual([
			{ scope: 'a', meta: expect.objectContaining({ saved: false }) }
		]);
	});
});
