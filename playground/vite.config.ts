import { cloudflare } from '@cloudflare/vite-plugin';
import { kartore } from '@kartore/editor/vite';
import { fileAdapter } from '@kartore/file-adapter/vite';
import { defineConfig } from 'vite';

// KARTORE_TARGET=node なら Node (srvx) 向け、それ以外は Cloudflare Workers 向け
const adapters = [fileAdapter()];

// KARTORE_BASE=/studio/ なら、ホストの /studio/ の下に置く例 (エディタ /studio/、API /studio/api/*)
const base = process.env.KARTORE_BASE || '/';

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
						nodeOutDir: 'dist-node',
						base
					})
				]
			: [
					kartore({ adapters, runtime: 'cloudflare', base }),
					// wrangler.jsonc の assets を base に合わせる。固定の base なら wrangler.jsonc に直接
					// `"base_path": "/studio/"` と `"run_worker_first": ["/studio/api/*"]` を書けばよい
					// (戻り値で返すと配列は足し合わされ "/api/*" が残るので、その場で書き換える)
					cloudflare({
						config: (config) => {
							if (base === '/') return;
							config.assets = {
								...config.assets,
								base_path: base,
								run_worker_first: [`${base}api/*`]
							};
						}
					})
				]
});
