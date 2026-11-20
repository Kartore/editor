import type { Map as MaplibreMap } from 'maplibre-gl';

/** attribution の 1 片。href があればリンクとして描く */
export type AttributionPart = { text: string; href?: string };

/**
 * 表示中のレイヤーが使うソースの attribution を集める。
 * MapLibre の AttributionControl と同じく、空を除き、他の attribution に含まれるものは落とす。
 * TileJSON (`url`) のソースは読み込み後に `map.getSource(id).attribution` へ入るので、そちらを優先する
 */
export const collectMapAttributions = (map: MaplibreMap): string[] => {
	const style = map.getStyle();
	if (!style) return [];
	const usedSourceIds = new Set<string>();
	for (const layer of style.layers ?? []) {
		if (!('source' in layer) || typeof layer.source !== 'string') continue;
		if (layer.layout?.visibility === 'none') continue;
		usedSourceIds.add(layer.source);
	}
	if (style.terrain?.source) usedSourceIds.add(style.terrain.source);

	const attributions: string[] = [];
	for (const id of usedSourceIds) {
		const fromSpec = (style.sources?.[id] as { attribution?: string } | undefined)?.attribution;
		const attribution = map.getSource(id)?.attribution ?? fromSpec;
		if (attribution && !attributions.includes(attribution)) attributions.push(attribution);
	}
	return dedupeAttributions(attributions);
};

export const dedupeAttributions = (attributions: readonly string[]): string[] => {
	const sorted = attributions.filter((a) => a.trim()).sort((a, b) => a.length - b.length);
	return sorted.filter((attribution, i) =>
		sorted.slice(i + 1).every((other) => !other.includes(attribution))
	);
};

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	copy: '©',
	reg: '®',
	trade: '™',
	middot: '·',
	ndash: '–',
	mdash: '—'
};

const decodeEntities = (value: string) =>
	value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
		if (entity[0] === '#') {
			const code =
				entity[1] === 'x' || entity[1] === 'X'
					? Number.parseInt(entity.slice(2), 16)
					: Number.parseInt(entity.slice(1), 10);
			return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
		}
		return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
	});

const textOf = (html: string) =>
	decodeEntities(html.replace(/<[^>]*>/g, ''))
		.replace(/\s+/g, ' ')
		.trim();

const safeHref = (raw: string | undefined) => {
	if (!raw) return undefined;
	const href = decodeEntities(raw).trim();
	return /^(https?:|mailto:)/i.test(href) ? href : undefined;
};

/**
 * attribution の HTML を、テキストと http(s)/mailto のリンクだけに分解する。
 * `{@html}` を使わずに描くためのもので、それ以外のタグや属性は捨てる
 */
export const parseAttribution = (source: string): AttributionPart[] => {
	// 中身ごと捨てるべき要素 (MapLibre のサニタイズでも表示されない)
	const html = source.replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, '');
	const parts: AttributionPart[] = [];
	const pushText = (raw: string) => {
		const text = textOf(raw);
		if (text) parts.push({ text });
	};
	const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
	let last = 0;
	for (const match of html.matchAll(anchor)) {
		pushText(html.slice(last, match.index));
		last = match.index + match[0].length;
		const text = textOf(match[2]);
		if (!text) continue;
		const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(match[1]);
		const href = safeHref(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3]);
		parts.push(href ? { text, href } : { text });
	}
	pushText(html.slice(last));
	return parts;
};
