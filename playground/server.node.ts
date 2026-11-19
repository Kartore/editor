import { startNodeServer } from '@kartore/editor/server/node';

import config from './kartore.node.ts';

// build:node の出力 dist/server/server.node.js から見た client ビルド
startNodeServer({ ...config, clientDir: new URL('../client/', import.meta.url) });
