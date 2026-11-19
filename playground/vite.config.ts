import { cloudflare } from '@cloudflare/vite-plugin';
import { kartore } from '@kartore/editor/vite';
import { fileAdapter } from '@kartore/file-adapter/vite';
import { defineConfig } from 'vite';

// KARTORE_TARGET=node なら Node (srvx) 向け、それ以外は Cloudflare Workers 向け
const adapters = [fileAdapter()];

export default defineConfig({
	plugins:
		process.env.KARTORE_TARGET === 'node'
			? [
					kartore({
						adapters,
						runtime: 'node',
						nodeConfig: './kartore.node.ts',
						nodeServer: './server.node.ts',
						// Cloudflare 用のビルド (dist/) と重ならないようにする
						nodeOutDir: 'dist-node'
					})
				]
			: [kartore({ adapters, runtime: 'cloudflare' }), cloudflare()]
});
