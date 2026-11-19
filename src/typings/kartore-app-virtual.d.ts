declare module 'virtual:kartore-app' {
	/** ホストの package.json の version (kartore() が注入) */
	export const appVersion: string;
}

declare module 'virtual:kartore-storage' {
	import type { KartoreStorageConfig } from '#src/editor/localDraft/types.ts';

	/** kartore({ storage }) で指定したモジュールの default export (未指定なら undefined) */
	const config: KartoreStorageConfig | undefined;
	export default config;
}
