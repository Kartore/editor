import { describe, expect, it, vi } from 'vitest';

import {
	createGlyphProtocolLoader,
	expandGlyphsUrl,
	parseGlyphProtocolUrl
} from './glyphProtocol.ts';

describe('glyph protocol URL parsing', () => {
	it('decodes the fontstack without changing its case', () => {
		expect(
			parseGlyphProtocolUrl('kartore-glyph://Noto%20Sans%20JP%20Regular/19968-20223.pbf')
		).toEqual({
			fontstack: 'Noto Sans JP Regular',
			start: 19968,
			end: 20223,
			range: '19968-20223'
		});
	});

	it('rejects malformed encodings and noncanonical ranges', () => {
		expect(() => parseGlyphProtocolUrl('kartore-glyph://Noto%ZZ/0-255.pbf')).toThrow(
			'Invalid encoded fontstack'
		);
		expect(() => parseGlyphProtocolUrl('kartore-glyph://Noto/1-256.pbf')).toThrow(
			'Invalid glyph range'
		);
		expect(() => parseGlyphProtocolUrl('https://example.com/Noto/0-255.pbf')).toThrow(
			'Invalid kartore-glyph URL'
		);
	});

	it('fills the original glyph template without mutating its placeholders first', () => {
		expect(
			expandGlyphsUrl(
				'https://example.com/fonts/{fontstack}/{range}.pbf',
				'Open Sans Regular',
				'0-255'
			)
		).toBe('https://example.com/fonts/Open Sans Regular/0-255.pbf');
	});
});

describe('glyph protocol loader', () => {
	it('generates local ranges without fetching', async () => {
		const fetchGlyphs = vi.fn<typeof fetch>();
		const generateRange = vi.fn(async () => Uint8Array.from([7, 8, 9]));
		const loader = createGlyphProtocolLoader({
			hasLocalFont: (fontstack) => fontstack === 'Noto Sans JP Regular',
			getOriginalGlyphsUrl: () => 'https://example.com/{fontstack}/{range}.pbf',
			generateRange,
			fetch: fetchGlyphs
		});

		const response = await loader(
			{ url: 'kartore-glyph://Noto%20Sans%20JP%20Regular/0-255.pbf' },
			new AbortController()
		);
		expect(new Uint8Array(response.data)).toEqual(Uint8Array.from([7, 8, 9]));
		expect(generateRange).toHaveBeenCalledWith('Noto Sans JP Regular', 0);
		expect(fetchGlyphs).not.toHaveBeenCalled();
	});

	it('passes unknown fontstacks through to the original glyph URL', async () => {
		const fetchGlyphs = vi.fn<typeof fetch>(
			async () =>
				new Response(Uint8Array.from([3, 2, 1]), {
					status: 200,
					headers: { etag: 'test-etag' }
				})
		);
		const loader = createGlyphProtocolLoader({
			hasLocalFont: () => false,
			getOriginalGlyphsUrl: () => 'https://example.com/fonts/{fontstack}/{range}.pbf',
			generateRange: vi.fn(),
			fetch: fetchGlyphs
		});
		const abortController = new AbortController();

		const response = await loader(
			{ url: 'kartore-glyph://Open%20Sans%20Regular/0-255.pbf' },
			abortController
		);
		expect(fetchGlyphs).toHaveBeenCalledWith(
			'https://example.com/fonts/Open Sans Regular/0-255.pbf',
			expect.objectContaining({ signal: abortController.signal })
		);
		expect(new Uint8Array(response.data)).toEqual(Uint8Array.from([3, 2, 1]));
		expect(response.etag).toBe('test-etag');
	});

	it('applies the adapter request transform to the original glyph URL (custom schemes)', async () => {
		const fetchGlyphs = vi.fn<typeof fetch>(async () => new Response(Uint8Array.from([1])));
		const transformRequest = vi.fn(async (url: string) => ({
			url: url.replace('cloudmap://glyphs/', 'https://cdn.example.com/glyphs/'),
			headers: { authorization: 'Bearer t' }
		}));
		const loader = createGlyphProtocolLoader({
			hasLocalFont: (fontstack) => fontstack === 'Local Regular',
			getOriginalGlyphsUrl: () => 'cloudmap://glyphs/{fontstack}/{range}.pbf',
			generateRange: vi.fn(async () => Uint8Array.from([9])),
			transformRequest,
			fetch: fetchGlyphs
		});

		await loader({ url: 'kartore-glyph://Remote%20Bold/256-511.pbf' }, new AbortController());
		expect(transformRequest).toHaveBeenCalledWith('cloudmap://glyphs/Remote Bold/256-511.pbf');
		expect(fetchGlyphs).toHaveBeenCalledWith(
			'https://cdn.example.com/glyphs/Remote Bold/256-511.pbf',
			expect.objectContaining({ headers: { authorization: 'Bearer t' } })
		);

		// ローカルフォントは書き換えより先に効く (書き換えも fetch もしない)
		transformRequest.mockClear();
		fetchGlyphs.mockClear();
		await loader({ url: 'kartore-glyph://Local%20Regular/0-255.pbf' }, new AbortController());
		expect(transformRequest).not.toHaveBeenCalled();
		expect(fetchGlyphs).not.toHaveBeenCalled();
	});

	it('rejects an unknown fontstack when the style has no original glyph URL', async () => {
		const loader = createGlyphProtocolLoader({
			hasLocalFont: () => false,
			getOriginalGlyphsUrl: () => undefined,
			generateRange: vi.fn()
		});

		await expect(
			loader({ url: 'kartore-glyph://Unknown/0-255.pbf' }, new AbortController())
		).rejects.toThrow('No local font or original glyphs URL');
	});
});
