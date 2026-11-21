import type {
	SpriteIcon,
	SpriteIcons,
	SpriteIconsStoreAdapter
} from './SpriteIconsStoreAdapter.ts';
import { normalizeSpriteIcons, spriteIcon } from './spriteIconsFormat.ts';

export type SpriteIconsStoreOptions = {
	adapter: SpriteIconsStoreAdapter;
	/** アイコンを追加・削除・置換したときに呼ぶ (読み込みでは呼ばない) */
	onChange?: () => void;
};

export class SpriteIconsStore {
	#adapter: SpriteIconsStoreAdapter;
	#onChange: (() => void) | undefined;
	#loadGeneration = 0;

	// 値がオブジェクトなので深いプロキシにしない (IndexedDB の put は構造化複製でプロキシを複製できない)。
	// 常に丸ごと差し替えるので raw でも反応する
	icons = $state.raw<SpriteIcons>({});
	isLoading = $state(true);
	isSaving = $state(false);
	loadError = $state<Error | null>(null);
	saveError = $state<Error | null>(null);
	ready: Promise<void>;

	constructor({ adapter, onChange }: SpriteIconsStoreOptions) {
		this.#adapter = adapter;
		this.#onChange = onChange;
		this.ready = this.#load();
	}

	/** 保存先を切り替えて読み直す */
	reload = (adapter: SpriteIconsStoreAdapter): Promise<void> => {
		this.#adapter = adapter;
		this.icons = {};
		this.loadError = null;
		this.saveError = null;
		this.isLoading = true;
		this.ready = this.#load();
		return this.ready;
	};

	setIcon = (id: string, icon: SpriteIcon) => {
		// 呼び出し元のオブジェクト (プロキシの可能性がある) を持ち込まず、正規形で作り直す
		this.icons = { ...this.icons, [id]: spriteIcon(icon.svg, icon) };
		this.#onChange?.();
		void this.#save({ ...this.icons });
	};

	removeIcon = (id: string) => {
		if (!(id in this.icons)) return;
		const icons = { ...this.icons };
		delete icons[id];
		this.icons = icons;
		this.#onChange?.();
		void this.#save(icons);
	};

	/**
	 * アイコン集合を丸ごと置き換える。アダプタや古いサーバーが旧形式 (`{ 名前: SVG }`) を渡しても受ける
	 * (host API の入口なので、型どおりでない値も正規形にする)
	 */
	replaceIcons = async (icons: SpriteIcons): Promise<void> => {
		const replacement = normalizeSpriteIcons(icons);
		if (!replacement) throw new Error('Invalid sprite icons.');
		this.isSaving = true;
		this.saveError = null;
		try {
			await this.#adapter.save(replacement);
			this.icons = replacement;
			this.#onChange?.();
		} catch (error) {
			const saveError = error instanceof Error ? error : new Error(String(error));
			this.saveError = saveError;
			throw saveError;
		} finally {
			this.isSaving = false;
		}
	};

	async #load() {
		// reload が重なったとき、古いロードの結果で上書きしない
		const generation = ++this.#loadGeneration;
		try {
			const icons = (await this.#adapter.load()) ?? {};
			if (generation === this.#loadGeneration) this.icons = icons;
		} catch (error) {
			if (generation !== this.#loadGeneration) return;
			this.loadError = error instanceof Error ? error : new Error(String(error));
		} finally {
			if (generation === this.#loadGeneration) this.isLoading = false;
		}
	}

	async #save(icons: SpriteIcons) {
		this.isSaving = true;
		this.saveError = null;
		try {
			await this.#adapter.save(icons);
		} catch (error) {
			this.saveError = error instanceof Error ? error : new Error(String(error));
		} finally {
			this.isSaving = false;
		}
	}
}
