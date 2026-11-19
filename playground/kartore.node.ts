import { sqliteKv } from '@kartore/editor/server/kv';
import type { NodeRuntimeConfig } from '@kartore/editor/server/node';

// Node の dev (vite) と本番 (server.node.ts) で共有する設定。env は既定で process.env
export default { kv: sqliteKv('.kartore/kv.sqlite') } satisfies NodeRuntimeConfig;
