import { describe, expect, it, vi } from 'vitest';

import type { FontCatalog } from '#src/editor/EditorModule.ts';

import { FontCatalogContext } from './fontCatalog.svelte.ts';

const catalog = (label: string, list: FontCatalog['list']): FontCatalog => ({
	available: true,
	label,
	list
});

describe('FontCatalogContext', () => {
	it('loads each catalog once and lists the names without duplicates', async () => {
		const context = new FontCatalogContext();
		const list = vi.fn(async () => ['Noto Sans JP Regular', 'Noto Sans JP Bold']);
		context.register(catalog('Service fonts', list));
		context.register(catalog('Other', async () => ['Noto Sans JP Bold', 'Open Sans Regular']));

		expect(context.fontNames).toEqual([]);
		context.load();
		context.load();
		await vi.waitFor(() => expect(context.fontNames).toHaveLength(3));

		expect(list).toHaveBeenCalledTimes(1);
		expect(context.fontNames).toEqual([
			'Noto Sans JP Regular',
			'Noto Sans JP Bold',
			'Open Sans Regular'
		]);
	});

	it('keeps the error of a catalog and loads it again next time', async () => {
		const context = new FontCatalogContext();
		const list = vi
			.fn<FontCatalog['list']>()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce(['Noto Sans JP Regular']);
		context.register(catalog('Service fonts', list));

		context.load();
		await vi.waitFor(() => expect(context.sections[0]?.error).toBe('offline'));
		context.load();
		await vi.waitFor(() => expect(context.fontNames).toEqual(['Noto Sans JP Regular']));
		expect(context.sections[0]?.error).toBeNull();
	});
});
