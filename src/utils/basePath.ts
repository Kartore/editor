/**
 * ホストの公開パス (`kartore({ base })`) を扱う純粋な関数。
 * base は常に正規形 (`/` か、`/studio/` のように先頭と末尾に `/` がつくパス)
 */

/**
 * kartore({ base }) の値を正規形にする。省略は `/`。末尾の `/` は補う。
 * `/` で始まらないもの (相対パス・URL)、`.` / `..` の区切り、`?` `#` `%` `\` を含むものはエラー
 */
export const normalizeBase = (base: string | undefined): string => {
	if (base === undefined || base === '/') return '/';
	if (!base.startsWith('/') || base.startsWith('//')) {
		throw new Error(
			`[kartore] base must be an absolute path such as '/studio/' (got ${JSON.stringify(base)}).`
		);
	}
	if (/[?#%\\]/.test(base)) {
		throw new Error(
			`[kartore] base must not contain '?', '#', '%' or '\\' (got ${JSON.stringify(base)}).`
		);
	}
	const segments = base.split('/').filter((segment) => segment !== '');
	if (segments.some((segment) => segment === '.' || segment === '..')) {
		throw new Error(
			`[kartore] base must not contain '.' or '..' segments (got ${JSON.stringify(base)}).`
		);
	}
	return segments.length === 0 ? '/' : `/${segments.join('/')}/`;
};

/** base からのパス (先頭の `/` はあってもなくてもよい。クエリ付き可) に base をつける */
export const joinBase = (base: string, path = ''): string => `${base}${path.replace(/^\/+/, '')}`;

/**
 * 公開パスから base を取り、`/` で始まるパスにする。base の外なら null。
 * base の末尾の `/` を除いたもの (`/studio`) は base 自身として `/` を返す
 */
export const stripBase = (pathname: string, base: string): string | null => {
	if (base === '/') return pathname;
	if (pathname === base.slice(0, -1)) return '/';
	if (!pathname.startsWith(base)) return null;
	return `/${pathname.slice(base.length)}`;
};

/** `<base>api/<id><path>`。アダプタの API の URL (ホスト root からのパス) */
export const apiPathFor = (base: string, id: string, path = ''): string =>
	joinBase(base, `api/${id}${withLeadingSlash(path)}`);

/** `<base><id><path>`。アダプタのページの URL (ホスト root からのパス) */
export const pagePathFor = (base: string, id: string, path = ''): string =>
	joinBase(base, `${id}${withLeadingSlash(path)}`);

const withLeadingSlash = (path: string): string =>
	path === '' || path.startsWith('/') || path.startsWith('?') ? path : `/${path}`;
