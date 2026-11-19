import { stripBase } from '#src/utils/basePath.ts';

export type ClientRoute =
	| { kind: 'editor' }
	/** `<module id>/<page path>` (先頭・末尾の `/` なし) */
	| { kind: 'page'; modulePath: string }
	/** base の外 */
	| { kind: 'outside' };

/** `<base>` はエディタ、`<base><module id>/<page path>` はアダプタページ、base の外は outside */
export const resolveClientRoute = (pathname: string, base: string): ClientRoute => {
	const path = stripBase(pathname, base);
	if (path === null) return { kind: 'outside' };
	const modulePath = path.replace(/^\/+|\/+$/g, '');
	return modulePath === '' ? { kind: 'editor' } : { kind: 'page', modulePath };
};
