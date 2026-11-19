/**
 * `@kartore/editor/paths` — ホストの公開パス (`kartore({ base })`) つきの URL を作る関数。
 * アダプタのクライアント (ブラウザで動くコード) が、自分の API とページの URL を作るのに使う。
 * kartore() の仮想モジュールから base を読むので、ホストの Vite の上でだけ動く
 *
 * ```ts
 * import { apiPath, pagePath } from '@kartore/editor/paths';
 * fetch(apiPath('github', '/repos/a/b'));      // base が '/studio/' なら '/studio/api/github/repos/a/b'
 * window.open(pagePath('github', '/diff?x=1')); // '/studio/github/diff?x=1'
 * ```
 */
// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient 宣言 (非 module) をアダプタの型チェックからも辿れるようにする
/// <reference path="./typings/kartore-app-virtual.d.ts" />
import { base } from 'virtual:kartore-app';

import { apiPathFor, joinBase, pagePathFor } from './utils/basePath.ts';

/** ホストの中で Kartore を置くパス。先頭と末尾に `/` がつく (例 '/studio/')。既定 '/' */
export { base };

/** base からのパス (先頭の `/` は任意。クエリ可) に base をつける。`withBase('/github/diff')` → '/studio/github/diff' */
export const withBase = (path: string): string => joinBase(base, path);

/** アダプタの API の URL。`apiPath('github', '/me')` → '<base>api/github/me' */
export const apiPath = (id: string, path = ''): string => apiPathFor(base, id, path);

/** アダプタのページの URL。`pagePath('github', '/diff')` → '<base>github/diff' */
export const pagePath = (id: string, path = ''): string => pagePathFor(base, id, path);
