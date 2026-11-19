import { describe, expect, it } from 'vitest';

import { resolveClientRoute } from './routing.ts';

describe('resolveClientRoute', () => {
	it('routes from the host root when base is /', () => {
		expect(resolveClientRoute('/', '/')).toEqual({ kind: 'editor' });
		expect(resolveClientRoute('/github/diff', '/')).toEqual({
			kind: 'page',
			modulePath: 'github/diff'
		});
		expect(resolveClientRoute('/github/diff/', '/')).toEqual({
			kind: 'page',
			modulePath: 'github/diff'
		});
	});

	it('routes under a sub path base', () => {
		expect(resolveClientRoute('/studio/', '/studio/')).toEqual({ kind: 'editor' });
		expect(resolveClientRoute('/studio', '/studio/')).toEqual({ kind: 'editor' });
		expect(resolveClientRoute('/studio/github/preview', '/studio/')).toEqual({
			kind: 'page',
			modulePath: 'github/preview'
		});
	});

	it('treats paths outside the base as outside', () => {
		expect(resolveClientRoute('/', '/studio/')).toEqual({ kind: 'outside' });
		expect(resolveClientRoute('/github/diff', '/studio/')).toEqual({ kind: 'outside' });
		expect(resolveClientRoute('/studio-x/', '/studio/')).toEqual({ kind: 'outside' });
	});
});
