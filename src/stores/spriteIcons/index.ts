export type {
	SpriteIcon,
	SpriteIconMetadata,
	SpriteIcons,
	SpriteIconsStoreAdapter,
	SpriteStretchRange,
	SpriteTextFit
} from './SpriteIconsStoreAdapter.ts';
export { localStorageSpriteIconsStoreAdapter } from './localStorageSpriteIconsStoreAdapter.ts';
export {
	hasSpriteIconSettings,
	normalizeSpriteIcons,
	SPRITE_TEXT_FIT_VALUES,
	spriteIcon,
	spriteIconRenderOptions,
	type SpriteIconSettings
} from './spriteIconsFormat.ts';
export { SpriteIconsStore, type SpriteIconsStoreOptions } from './spriteIconsStore.svelte.ts';
