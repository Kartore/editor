/** ブラウザにファイルとして保存させる */
export const downloadBlob = (contents: string | Uint8Array, type: string, fileName: string) => {
	const blob = new Blob([contents as BlobPart], { type });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	anchor.click();
	URL.revokeObjectURL(url);
};
