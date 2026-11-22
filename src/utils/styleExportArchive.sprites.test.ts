import { describe, expect, it, vi } from 'vitest';

type SpriteIcon = { id: string; svg: string; sdf?: boolean };
type BuildSpriteSheet = (
	icons: SpriteIcon[],
	pixelRatio: number,
	options?: { fast?: boolean }
) => Promise<{ png: Uint8Array; indexJson: string; index: object }>;

const buildSpriteSheet = vi.fn<BuildSpriteSheet>(async (icons, pixelRatio) => ({
	png: Uint8Array.from([pixelRatio]),
	indexJson: JSON.stringify(
		Object.fromEntries(icons.map(({ id, sdf }) => [id, sdf ? { pixelRatio, sdf } : { pixelRatio }]))
	),
	index: {}
}));

vi.mock('#src/sprites/spritore.ts', () => ({
	loadSpritore: async () => ({ buildSpriteSheet })
}));

const { buildSpriteFiles } = await import('./styleExportArchive.ts');

describe('buildSpriteFiles', () => {
	it('passes the sdf flag of each icon to spritore, and builds fast', async () => {
		const files = await buildSpriteFiles({
			pin: { svg: '<svg id="pin"/>', sdf: true },
			arrow: { svg: '<svg id="arrow"/>', stretchX: [[1, 2]], textFitWidth: 'proportional' }
		});

		expect(buildSpriteSheet).toHaveBeenCalledWith(
			[
				{
					id: 'arrow',
					svg: '<svg id="arrow"/>',
					sdf: false,
					stretchX: [[1, 2]],
					textFitWidth: 'proportional'
				},
				{ id: 'pin', svg: '<svg id="pin"/>', sdf: true }
			],
			1,
			{ fast: true }
		);
		expect(JSON.parse(files['sprite@2x.json'] as string)).toEqual({
			arrow: { pixelRatio: 2 },
			pin: { pixelRatio: 2, sdf: true }
		});
	});

	it('returns no files without icons', async () => {
		buildSpriteSheet.mockClear();
		await expect(buildSpriteFiles({})).resolves.toEqual({});
		expect(buildSpriteSheet).not.toHaveBeenCalled();
	});
});
