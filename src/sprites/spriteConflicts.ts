/**
 * ローカルのアイコンと同じ名前の画像がスタイルの sprite (スプライトシート) にもあるもの。
 * 地図ではローカルのアイコンが優先される (MapSpriteSynchronizer) ので、シート側の画像は隠れる。
 *
 * sheetImageIds は地図上の名前 (sprite が配列なら `<sprite id>:<名前>`、ただし id が "default" のシートは接頭辞なし)。
 * 念のため `default:` 付きで渡されても接頭辞なしとして扱う
 */
export const findShadowedSpriteIds = (
	localIds: Iterable<string>,
	sheetImageIds: Iterable<string>
): string[] => {
	const sheetNames = new Set(
		[...sheetImageIds].map((id) => (id.startsWith('default:') ? id.slice('default:'.length) : id))
	);
	return [...new Set(localIds)].filter((id) => sheetNames.has(id)).sort();
};
