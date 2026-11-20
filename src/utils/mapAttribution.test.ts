import { describe, expect, it } from 'vitest';

import { dedupeAttributions, parseAttribution } from './mapAttribution.ts';

describe('dedupeAttributions', () => {
	it('drops empty entries and ones contained in another', () => {
		expect(dedupeAttributions(['', '© OSM', '© OpenMapTiles © OSM', '  ', '© GSI'])).toEqual([
			'© GSI',
			'© OpenMapTiles © OSM'
		]);
	});
});

describe('parseAttribution', () => {
	it('splits links and text and decodes entities', () => {
		expect(
			parseAttribution(
				'<a href="https://openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> <a href=\'https://www.openstreetmap.org/copyright\'>&copy; OpenStreetMap contributors</a>'
			)
		).toEqual([
			{ text: '© OpenMapTiles', href: 'https://openmaptiles.org/' },
			{ text: '© OpenStreetMap contributors', href: 'https://www.openstreetmap.org/copyright' }
		]);
	});

	it('keeps plain text and strips other tags', () => {
		expect(parseAttribution('<b>地理院タイル</b> &amp; 国土数値情報')).toEqual([
			{ text: '地理院タイル & 国土数値情報' }
		]);
	});

	it('drops script contents', () => {
		expect(parseAttribution('© A<script>alert(1)</script> © B')).toEqual([{ text: '© A © B' }]);
	});

	it('drops unsafe hrefs but keeps the link text', () => {
		expect(parseAttribution('<a href="javascript:alert(1)">evil</a>')).toEqual([{ text: 'evil' }]);
	});
});
