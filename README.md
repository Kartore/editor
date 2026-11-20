# @kartore/editor

The [Kartore](https://app.kartore.io) MapLibre style editor as a source-distributed Svelte 5 package.
A host is a plain Vite project: the `kartore()` preset builds the editor SPA, and a small runtime entry serves
the adapter APIs on **Cloudflare Workers** or **Node** (no SvelteKit).

## Host

```ts
// vite.config.ts (Cloudflare Workers)
import { cloudflare } from '@cloudflare/vite-plugin';
import { kartore } from '@kartore/editor/vite';
import { fileAdapter } from '@kartore/file-adapter/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [kartore({ adapters: [fileAdapter()], runtime: 'cloudflare' }), cloudflare()]
});
```

```ts
// worker.ts
import { createCloudflareHandler } from '@kartore/editor/server/cloudflare';
export default createCloudflareHandler(); // KV binding 'KARTORE_KV' by default
```

```jsonc
// wrangler.jsonc
"main": "./worker.ts",
"assets": { "binding": "ASSETS", "not_found_handling": "none", "run_worker_first": ["/api/*"] }
```

Paths without a file reach the Worker, which answers `index.html` for the editor and adapter pages and 404 for
missing build assets (`/assets/…`, e.g. chunks referenced by an HTML page from before a deploy). With
`not_found_handling: "single-page-application"` those missing chunks get `index.html` and the page stays blank.

`index.html` only needs a `<head>` (charset, viewport, favicon, title); `kartore()` injects the editor entry.

**Node** (srvx): `kartore({ adapters, runtime: 'node', nodeConfig: './kartore.node.ts', nodeServer: './server.node.ts' })`.
`vite build` then emits `dist/client` and `dist/server/server.node.js`.

```ts
// kartore.node.ts — shared by the dev middleware and the production server
import { sqliteKv } from '@kartore/editor/server/kv';
export default { kv: sqliteKv('.kartore/kv.sqlite') }; // env defaults to process.env

// server.node.ts
import { startNodeServer } from '@kartore/editor/server/node';
import config from './kartore.node.ts';
startNodeServer({ ...config, clientDir: new URL('../client/', import.meta.url) });
```

Behind a reverse proxy set `PUBLIC_ORIGIN` (used for `runtime.origin`, secure cookies and the CSRF check).

See `playground/` for a host with both entries (`pnpm dev` / `dev:node` / `build` / `build:node` / `start:node`).

### Sub path (`base`)

To share a host with another app, put Kartore under a path: `kartore({ ..., base: '/studio/' })` (default `'/'`).
The editor is served at `/studio/`, adapter pages at `/studio/<module id>/<page path>` and APIs at `/studio/api/<id>/*`.
Vite's `base` is set to the same value (assets at `/studio/assets/…`); do not set Vite's `base` separately.
The server core strips the base before calling an adapter, so handlers still see `/api/<id>/*`.

The build output is not nested: `dist/client` holds `index.html` and `assets/`, and the runtime maps it under the base.

```jsonc
// wrangler.jsonc (Cloudflare): serve dist/client under /studio/, run the worker only for the APIs
"assets": {
	"binding": "ASSETS",
	"base_path": "/studio/",
	"not_found_handling": "none", // the worker answers /studio/index.html for pages, 404 for /studio/assets/…
	"run_worker_first": ["/studio/api/*"]
}
```

On Node, `startNodeServer` serves `clientDir` under the base, falls back to `index.html` inside the base (404 for
missing `/studio/assets/…`), redirects `/studio` to `/studio/` and answers 404 outside it. Kartore's cookies are scoped to the base (`kartore_session`:
`/studio/`); localStorage (`kartore:*`) and IndexedDB (`kartore-drafts`, `kartore-fonts`) are per origin, so other apps
on the same origin must not use those names. The playground runs this setup with `pnpm dev:studio` / `build:studio` /
`dev:node:studio` / `build:node:studio`.

## Exports

| Subpath                                       | Contents                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `@kartore/editor/vite`                        | `kartore()` preset                                                                                                  |
| `@kartore/editor/types`                       | Types only: `EditorModule`, `EditorApi`, `SpriteIcons`, `KartoreRuntime`, `AdapterApiHandler`, local draft types, … |
| `@kartore/editor/paths`                       | Client URLs under the host base: `base`, `withBase(path)`, `apiPath(id, path)`, `pagePath(id, path)`                |
| `@kartore/editor/server`                      | `handleKartoreRequest(request, createRuntime)` (runtime-agnostic server core), `createRuntimeBase`                  |
| `@kartore/editor/server/cloudflare` / `/node` | `createCloudflareHandler()` / `startNodeServer()`                                                                   |
| `@kartore/editor/server/kv`                   | `memoryKv()`, `sqliteKv(path)` (`node:sqlite`)                                                                      |
| `@kartore/editor/storage`                     | Local draft storage: `createIndexedDbEditorStorage()`, `createDefaultEditorStorage()`, `listUnsavedDrafts()`        |
| `@kartore/editor/export`                      | style.json / sprite (spritore) / glyph (glyphore) / ZIP builders and content hashes                                 |
| `@kartore/editor`                             | `Editor` / `EditorRoot` Svelte components                                                                           |

### Local drafts (per-style storage)

By default the editor keeps one draft (localStorage `kartore:style` / `kartore:sprite-svgs`, IndexedDB `kartore-fonts`).
To keep one draft per style, pass `kartore({ storage: './kartore.storage.ts' })`:

```ts
import { createIndexedDbEditorStorage, type KartoreStorageConfig } from '@kartore/editor/storage';

export default {
	storage: createIndexedDbEditorStorage(), // style, icons, fonts and metadata per scope in IndexedDB
	scope: () => resolveScopeFromLocation() // e.g. '<env>:<user>:<org>:<style>'; may return a Promise
} satisfies KartoreStorageConfig;
```

With such a storage the editor asks to recover unsaved edits when a scope is opened and confirms before the page
is closed. Adapters switch scopes with `editor.openDraftScope(scope)` and record saves with `editor.markSaved()`.

## Adapter contract v2

An adapter is a manifest (`{ name, api: { kartoreAdapter: { contract: 2, clientModule, serverModule? } } }`) passed to
`kartore({ adapters })`.

- `clientModule` exports `adapterModules: EditorModule[]` and `adapterProviders`
- `serverModule` exports `adapterApiHandlers: AdapterApiHandler[]` — `{ id, requiredEnv?, optionalEnv?, fetch(request, runtime) }`,
  served at `<base>api/<id>/*` (the handler sees `/api/<id>/*`). `runtime` is a `KartoreRuntime` (`env` strings, an `<id>:`-namespaced
  `kv`, `waitUntil`, `origin`, `secure`, `base`, and `url(path)` = `origin` + `base` + path for OAuth callbacks, links and cookie paths)
- Adapter clients build their URLs with `@kartore/editor/paths` (`apiPath('github', '/me')` → `/studio/api/github/me`),
  never root-absolute paths
- Adapter pages receive the current URL as the `url` prop. SvelteKit modules (`$app/*`, `$env/*`, `@sveltejs/kit`) are a build error
- Types come from `@kartore/editor/types` (declare `@kartore/editor` as a peer dependency)

## Development

```sh
pnpm install
pnpm dev          # playground (Cloudflare dev via @cloudflare/vite-plugin)
pnpm test         # vitest
pnpm check        # svelte-check
pnpm lint
pnpm build        # tsdown: dist/vite.js + dist/vite.d.ts (the kartore() preset)
```
