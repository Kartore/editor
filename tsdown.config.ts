import { defineConfig } from 'tsdown';

// `@kartore/editor/vite` (kartore() プリセット) を dist/vite.js と dist/vite.d.ts にビルドする。
// ホストの vite.config.ts から Node で読まれるため JS にする (Node は node_modules 内の .ts を実行しない)。
// エディタ本体 (src) はソースのまま配布する。依存 (dependencies / peerDependencies / node:*) はすべて外部のまま
export default defineConfig({
	entry: { vite: 'src/vite/index.ts' },
	platform: 'node',
	fixedExtension: false,
	// 本体の tsconfig.json はブラウザ向け (vite/client)。プリセットは Node で動くので node の型で宣言を作る
	dts: { compilerOptions: { types: ['node'] } }
});
