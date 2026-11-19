import { svelte } from '@sveltejs/vite-plugin-svelte';
import { configDefaults, defineConfig } from 'vitest/config';

// vitest 用の設定 (このパッケージ自身はアプリではない。kartore() プリセットのビルドは tsdown.config.ts)。
// `.svelte.test.ts` のために svelte() plugin を入れる
export default defineConfig({
	plugins: [
		svelte({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				experimental: { async: true }
			}
		})
	],
	test: {
		// 別セッションの worktree (.claude/worktrees) や playground のテストを拾わない
		exclude: [...configDefaults.exclude, '.claude/**', 'playground/**']
	}
});
