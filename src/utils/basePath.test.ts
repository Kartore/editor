import { describe, expect, it } from 'vitest';

import { apiPathFor, joinBase, normalizeBase, pagePathFor, stripBase } from './basePath.ts';

describe('normalizeBase', () => {
	it('defaults to / and keeps canonical values', () => {
		expect(normalizeBase(undefined)).toBe('/');
		expect(normalizeBase('/')).toBe('/');
		expect(normalizeBase('/studio/')).toBe('/studio/');
		expect(normalizeBase('/a/b/')).toBe('/a/b/');
	});

	it('adds the trailing slash and collapses duplicate slashes', () => {
		expect(normalizeBase('/studio')).toBe('/studio/');
		expect(normalizeBase('/studio//x//')).toBe('/studio/x/');
	});

	it('rejects relative paths, URLs and unsafe characters', () => {
		for (const value of [
			'studio/',
			'./studio/',
			'',
			'https://a.example/studio/',
			'//a/',
			'/a?b/'
		]) {
			expect(() => normalizeBase(value)).toThrow(/\[kartore\] base/);
		}
		expect(() => normalizeBase('/a/../b/')).toThrow(/'\.\.'/);
		expect(() => normalizeBase('/a%2F/')).toThrow();
	});
});

describe('joinBase / stripBase', () => {
	it('joins base-relative paths with or without the leading slash', () => {
		expect(joinBase('/', '/github/diff?x=1')).toBe('/github/diff?x=1');
		expect(joinBase('/studio/', '/github/diff?x=1')).toBe('/studio/github/diff?x=1');
		expect(joinBase('/studio/', 'api/github')).toBe('/studio/api/github');
		expect(joinBase('/studio/')).toBe('/studio/');
	});

	it('strips the base and rejects paths outside it', () => {
		expect(stripBase('/api/github/me', '/')).toBe('/api/github/me');
		expect(stripBase('/studio/api/github/me', '/studio/')).toBe('/api/github/me');
		expect(stripBase('/studio/', '/studio/')).toBe('/');
		expect(stripBase('/studio', '/studio/')).toBe('/');
		expect(stripBase('/api/github/me', '/studio/')).toBeNull();
		expect(stripBase('/studio-other/x', '/studio/')).toBeNull();
		expect(stripBase('/', '/studio/')).toBeNull();
	});
});

describe('apiPathFor / pagePathFor', () => {
	it('builds adapter URLs under the base', () => {
		expect(apiPathFor('/', 'github', '/repos/a/b')).toBe('/api/github/repos/a/b');
		expect(apiPathFor('/studio/', 'github', '/repos/a/b')).toBe('/studio/api/github/repos/a/b');
		expect(apiPathFor('/studio/', 'github', 'me')).toBe('/studio/api/github/me');
		expect(apiPathFor('/studio/', 'github')).toBe('/studio/api/github');
		expect(pagePathFor('/', 'github', '/diff')).toBe('/github/diff');
		expect(pagePathFor('/studio/', 'github', '/diff?owner=a')).toBe('/studio/github/diff?owner=a');
		expect(pagePathFor('/studio/', 'github', 'diff')).toBe('/studio/github/diff');
		expect(pagePathFor('/studio/', 'github', '?x=1')).toBe('/studio/github?x=1');
	});
});
