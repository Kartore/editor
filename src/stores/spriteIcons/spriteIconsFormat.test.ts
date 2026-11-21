import { describe, expect, it } from 'vitest';

import { normalizeSpriteIcons, spriteIcon } from './spriteIconsFormat.ts';

describe('spriteIcon', () => {
	it('keeps sdf only when it is true', () => {
		expect(spriteIcon('<svg />')).toEqual({ svg: '<svg />' });
		expect(spriteIcon('<svg />', { sdf: false })).toEqual({ svg: '<svg />' });
		expect(spriteIcon('<svg />', { sdf: true })).toEqual({ svg: '<svg />', sdf: true });
		expect(
			spriteIcon('<svg />', { stretchX: [], stretchY: [[1, 2]], textFitWidth: undefined })
		).toEqual({ svg: '<svg />', stretchY: [[1, 2]] });
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

	it('reads 9-slice metadata and drops empty ranges', () => {
		expect(
			normalizeSpriteIcons({
				a: {
					svg: '<svg/>',
					stretchX: [[1, 2]],
					stretchY: [],
					content: [1, 1, 3, 3],
					textFitWidth: 'proportional'
				}
			})
		).toEqual({
			a: { svg: '<svg/>', stretchX: [[1, 2]], content: [1, 1, 3, 3], textFitWidth: 'proportional' }
		});
	});

	it.each([
		{ svg: '<svg/>', stretchX: [[1]] },
		{ svg: '<svg/>', stretchY: 'x' },
		{ svg: '<svg/>', content: [1, 2, 3] },
		{ svg: '<svg/>', content: [1, 2, 3, Number.NaN] },
		{ svg: '<svg/>', textFitHeight: 'stretch' }
	])('rejects malformed metadata %j', (icon) => {
		expect(normalizeSpriteIcons({ a: icon })).toBeNull();
	});

	it.each([null, [], 'x', { a: 1 }, { a: { sdf: true } }, { a: null }])('rejects %j', (value) => {
		expect(normalizeSpriteIcons(value)).toBeNull();
	});
});
