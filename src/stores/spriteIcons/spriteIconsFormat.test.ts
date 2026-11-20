import { describe, expect, it } from 'vitest';

import { normalizeSpriteIcons, spriteIcon } from './spriteIconsFormat.ts';

describe('spriteIcon', () => {
	it('keeps sdf only when it is true', () => {
		expect(spriteIcon('<svg />')).toEqual({ svg: '<svg />' });
		expect(spriteIcon('<svg />', false)).toEqual({ svg: '<svg />' });
		expect(spriteIcon('<svg />', true)).toEqual({ svg: '<svg />', sdf: true });
	});
});

describe('normalizeSpriteIcons', () => {
	it('converts the legacy string format', () => {
		expect(normalizeSpriteIcons({ a: '<svg id="a"/>' })).toEqual({ a: { svg: '<svg id="a"/>' } });
	});

	it('accepts the object format and drops a false sdf flag', () => {
		expect(
			normalizeSpriteIcons({
				a: { svg: '<svg id="a"/>', sdf: true },
				b: { svg: '<svg id="b"/>', sdf: false },
				c: { svg: '<svg id="c"/>' }
			})
		).toEqual({
			a: { svg: '<svg id="a"/>', sdf: true },
			b: { svg: '<svg id="b"/>' },
			c: { svg: '<svg id="c"/>' }
		});
	});

	it('accepts a mix of both formats', () => {
		expect(normalizeSpriteIcons({ a: '<svg/>', b: { svg: '<svg/>', sdf: true } })).toEqual({
			a: { svg: '<svg/>' },
			b: { svg: '<svg/>', sdf: true }
		});
	});

	it.each([null, [], 'x', { a: 1 }, { a: { sdf: true } }, { a: null }])('rejects %j', (value) => {
		expect(normalizeSpriteIcons(value)).toBeNull();
	});
});
