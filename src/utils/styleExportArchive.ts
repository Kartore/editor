import type { StyleSpecification } from 'maplibre-gl';

import type { LoadedFont } from '#src/stores/fonts';
import { buildGlyphFiles as buildGlyphFilesForFont } from '#src/fonts/glyphDownload.ts';
import { loadGlyphore } from '#src/fonts/glyphore.ts';
import { loadSpritore } from '#src/sprites/spritore.ts';

import {
	createStyleExports,
	type StyleExportAssetUrls,
	type StyleExportKind
} from './styleExport.ts';
import { createStylePackArchive } from './stylePackArchive.ts';
import type { StylePackFiles } from './stylePack.ts';

const SPRITE_DIRECTORY = 'sprite';
const SPRITE_URL = `${SPRITE_DIRECTORY}/sprite`;
const GLYPH_DIRECTORY = 'glyphs';
const GLYPH_URL_TEMPLATE = `${GLYPH_DIRECTORY}/{fontstack}/{range}.pbf`;

const compareKeys = (left: string, right: string): number =>
	left < right ? -1 : left > right ? 1 : 0;

export type StyleExportArchiveAssets = {
	icons: Readonly<Record<string, string>>;
	fontstacks: readonly string[];
	getLoadedFont: (fontstack: string) => Promise<LoadedFont | null>;
};

export type StyleExportGeneratedAssets = {
	spriteFiles?: Readonly<StylePackFiles>;
	glyphFiles?: Readonly<StylePackFiles>;
};

const hasFiles = (files: Readonly<StylePackFiles> | undefined): files is StylePackFiles =>
	files !== undefined && Object.keys(files).length > 0;

const addFile = (files: StylePackFiles, path: string, value: string | Uint8Array): void => {
	if (path in files) throw new Error(`Duplicate export archive path: ${path}`);
	files[path] = value;
};

/** 生成済み asset と style JSON を、抽出後にそのまま使えるファイルマップへまとめる。 */
export const createStyleExportArchiveFiles = (
	style: StyleSpecification,
	kind: StyleExportKind,
	generated: StyleExportGeneratedAssets = {}
): StylePackFiles => {
	const assetUrls: StyleExportAssetUrls = {
		...(hasFiles(generated.spriteFiles) ? { sprite: SPRITE_URL } : {}),
		...(hasFiles(generated.glyphFiles) ? { glyphs: GLYPH_URL_TEMPLATE } : {})
	};
	const files: StylePackFiles = {};

	for (const styleExport of createStyleExports(style, kind, assetUrls)) {
		addFile(files, styleExport.fileName, styleExport.contents);
	}

	for (const [path, value] of Object.entries(generated.spriteFiles ?? {})) {
		addFile(files, `${SPRITE_DIRECTORY}/${path}`, value);
	}
	for (const [path, value] of Object.entries(generated.glyphFiles ?? {})) {
		addFile(files, `${GLYPH_DIRECTORY}/${path}`, value);
	}

	return files;
};

/** ローカルのアイコン (SVG) から sprite.json / sprite.png / sprite@2x.json / sprite@2x.png を作る。アイコンが無ければ空 */
export const buildSpriteFiles = async (
	icons: Readonly<Record<string, string>>
): Promise<StylePackFiles> => {
	const spriteIcons = Object.entries(icons)
		.sort(([left], [right]) => compareKeys(left, right))
		.map(([id, svg]) => ({ id, svg }));
	if (spriteIcons.length === 0) return {};

	const { buildSpriteSheet } = await loadSpritore();
	const [oneX, twoX] = await Promise.all([
		buildSpriteSheet(spriteIcons, 1),
		buildSpriteSheet(spriteIcons, 2)
	]);
	return {
		'sprite.json': oneX.indexJson,
		'sprite.png': oneX.png,
		'sprite@2x.json': twoX.indexJson,
		'sprite@2x.png': twoX.png
	};
};

/** ローカルフォントから `<fontstack>/<start>-<end>.pbf` のグリフを作る。フォントが無ければ空 */
export const buildGlyphFiles = async ({
	fontstacks,
	getLoadedFont
}: Pick<StyleExportArchiveAssets, 'fontstacks' | 'getLoadedFont'>): Promise<StylePackFiles> => {
	const names = [...new Set(fontstacks)].sort(compareKeys);
	if (names.length === 0) return {};

	const { generateRange } = await loadGlyphore();
	const files: StylePackFiles = {};
	for (const fontstack of names) {
		const font = await getLoadedFont(fontstack);
		if (!font) throw new Error(`Local font “${fontstack}” is no longer available.`);

		const glyphFiles = await buildGlyphFilesForFont({
			fontstack,
			ranges: font.info.coveredRanges,
			generateRange: (start) => generateRange(font, start)
		});
		for (const [path, value] of Object.entries(glyphFiles)) {
			addFile(files, path, value);
		}
	}
	return files;
};

/** ローカル sprite / glyph を生成し、style JSON と一緒に決定的な ZIP へまとめる。 */
export const createStyleExportArchive = async (
	style: StyleSpecification,
	kind: StyleExportKind,
	assets: StyleExportArchiveAssets
): Promise<Uint8Array> => {
	const [spriteFiles, glyphFiles] = await Promise.all([
		buildSpriteFiles(assets.icons),
		buildGlyphFiles(assets)
	]);
	return createStylePackArchive(
		createStyleExportArchiveFiles(style, kind, { spriteFiles, glyphFiles })
	);
};

const textEncoder = new TextEncoder();

const toBytes = (value: string | Uint8Array): Uint8Array =>
	typeof value === 'string' ? textEncoder.encode(value) : value;

/**
 * ファイル群の中身のハッシュ (SHA-256 の 16 進)。パスの順に「パス・長さ・中身」を並べて計算するので、
 * 同じ中身なら同じ値になる。ファイルが無ければ null
 */
export const hashFiles = async (files: Readonly<StylePackFiles>): Promise<string | null> => {
	const paths = Object.keys(files).sort(compareKeys);
	if (paths.length === 0) return null;
	const parts: Uint8Array[] = [];
	for (const path of paths) {
		const content = toBytes(files[path]);
		parts.push(textEncoder.encode(`${path}\0${content.byteLength}\0`), content);
	}
	const joined = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
	let offset = 0;
	for (const part of parts) {
		joined.set(part, offset);
		offset += part.byteLength;
	}
	const digest = await crypto.subtle.digest('SHA-256', joined);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export type StyleAssetBundle = {
	/** sprite.json / sprite.png / sprite@2x.json / sprite@2x.png (アイコンが無ければ空) */
	spriteFiles: StylePackFiles;
	/** `<fontstack>/<start>-<end>.pbf` (フォントが無ければ空) */
	glyphFiles: StylePackFiles;
	spriteHash: string | null;
	glyphsHash: string | null;
	/** スプライトとグリフの組のハッシュ (どちらも無ければ null) */
	hash: string | null;
};

/** ローカルのアイコンとフォントから、スプライトとグリフを作り、中身のハッシュを付けて返す */
export const buildStyleAssetBundle = async (
	assets: StyleExportArchiveAssets
): Promise<StyleAssetBundle> => {
	const [spriteFiles, glyphFiles] = await Promise.all([
		buildSpriteFiles(assets.icons),
		buildGlyphFiles(assets)
	]);
	const prefixed = (prefix: string, files: StylePackFiles) =>
		Object.fromEntries(Object.entries(files).map(([path, value]) => [`${prefix}/${path}`, value]));
	const [spriteHash, glyphsHash, hash] = await Promise.all([
		hashFiles(spriteFiles),
		hashFiles(glyphFiles),
		hashFiles({
			...prefixed(SPRITE_DIRECTORY, spriteFiles),
			...prefixed(GLYPH_DIRECTORY, glyphFiles)
		})
	]);
	return { spriteFiles, glyphFiles, spriteHash, glyphsHash, hash };
};
