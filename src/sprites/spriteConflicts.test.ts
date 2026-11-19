import { describe, expect, it } from 'vitest';

import { findShadowedSpriteIds } from './spriteConflicts.ts';

describe('findShadowedSpriteIds', () => {
	it('finds local icons that share a name with the style sprite', () => {
		expect(findShadowedSpriteIds(['arrow', 'pin', 'bus'], ['bus', 'arrow', 'park'])).toEqual([
			'arrow',
			'bus'
		]);
		expect(findShadowedSpriteIds(['pin'], ['arrow'])).toEqual([]);
	});

	it('treats the "default" sheet of a sprite array as unprefixed, and other sheets as prefixed', () => {
		expect(
			findShadowedSpriteIds(['arrow', 'roads:shield'], ['default:arrow', 'roads:shield', 'roads:x'])
		).toEqual(['arrow', 'roads:shield']);
		expect(findShadowedSpriteIds(['shield'], ['roads:shield'])).toEqual([]);
	});
});
