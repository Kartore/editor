import type { StyleSpecification } from 'maplibre-gl';

import type { FontsStore } from '../../stores/fonts/fontsStore.svelte.ts';
import type { MapStyleStore } from '../../stores/mapStyle/mapStyleStore.svelte.ts';
import type { SpriteIconsStore } from '../../stores/spriteIcons/spriteIconsStore.svelte.ts';

import { emptyLocalDraftMeta, filterUnsavedDrafts, hasUnsavedEdits } from './meta.ts';
import type {
	EditorStorage,
	LocalDraftInspection,
	LocalDraftInspector,
	LocalDraftMeta,
	LocalDraftOpenResult,
	LocalDraftStore,
	LocalDraftSummary
} from './types.ts';

export type LocalDraftSessionStores = {
	style: MapStyleStore;
	icons: SpriteIconsStore;
	fonts: FontsStore;
	/** 空のスコープを開いたときのスタイル */
	initialStyle: () => StyleSpecification;
};

/** 復旧ダイアログの中身。null のときダイアログは出ない */
export type LocalDraftRecoveryPrompt = {
	scope: string | null;
	meta: LocalDraftMeta;
	/** 登録された inspector の結果 (読み込み中は inspecting が true) */
	inspections: LocalDraftInspection[];
	inspecting: boolean;
};

type RecoveryChoice = 'restore' | 'discard';

const META_SAVE_DELAY_MS = 500;

/**
 * 開いているスコープの手元の保存を管理する。
 * - スコープの切り替え (保存先の差し替えと読み直し)
 * - 情報 (最後の編集時刻・保存済み・アダプタの欄) の記録
 * - 保存していない編集があるときの復旧ダイアログの状態
 */
export class LocalDraftSession {
	readonly storage: EditorStorage;
	scope = $state<string | null>(null);
	meta = $state<LocalDraftMeta>(emptyLocalDraftMeta());
	recovery = $state<LocalDraftRecoveryPrompt | null>(null);
	/** スコープを開いている途中 (読み込み〜復旧の選択まで) */
	opening = $state(true);

	#draft: LocalDraftStore;
	#stores: LocalDraftSessionStores | null = null;
	#inspectors: LocalDraftInspector[] = [];
	// 描画に関わらないリスナーの集合なのでリアクティブにしない
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#listeners = new Set<(result: LocalDraftOpenResult) => void>();
	#lastResult: LocalDraftOpenResult | null = null;
	#queue: Promise<unknown> = Promise.resolve();
	#metaTimer: ReturnType<typeof setTimeout> | null = null;
	#metaDirty = false;
	#resolveRecovery: ((choice: RecoveryChoice) => void) | null = null;
	#recoveryGeneration = 0;
	#now: () => number;

	constructor({
		storage,
		scope,
		now = Date.now
	}: {
		storage: EditorStorage;
		scope: string | null;
		now?: () => number;
	}) {
		this.storage = storage;
		this.scope = scope;
		this.#draft = storage.open(scope);
		this.#now = now;
	}

	/** 最初のスコープの保存先。ストアを作るときに使う */
	get initialDraft(): LocalDraftStore {
		return this.#draft;
	}

	get hasUnsavedEdits(): boolean {
		return hasUnsavedEdits(this.meta);
	}

	/** ストアをつないで最初のスコープを開く (ストアは initialDraft の保存先で作っておくこと) */
	start = (stores: LocalDraftSessionStores): Promise<LocalDraftOpenResult> => {
		this.#stores = stores;
		return this.#enqueue(() => this.#open(this.scope, this.#draft, false));
	};

	/** 別のスコープを開く。今のスコープの保存していない書き込みを済ませてから切り替える */
	open = (scope: string | null): Promise<LocalDraftOpenResult> =>
		this.#enqueue(async () => {
			if (scope === this.scope && this.#lastResult) return this.#lastResult;
			await this.#flushMeta();
			const draft = this.storage.open(scope);
			this.scope = scope;
			this.#draft = draft;
			return this.#open(scope, draft, true);
		});

	/** ストアの中身が変わったとき (ストアの onChange から呼ぶ) */
	markChanged = () => {
		if (this.opening) return;
		this.meta = { ...this.meta, editedAt: this.#now(), saved: false };
		this.#scheduleMetaSave();
	};

	/** 保存できたことを記録する。中身は消さない。adapters を渡すとアダプタの欄も同時に書き換える */
	markSaved = (adapters?: Record<string, unknown>): Promise<void> => {
		this.meta = {
			...this.meta,
			saved: true,
			savedAt: this.#now(),
			adapters: adapters ? { ...this.meta.adapters, ...adapters } : this.meta.adapters
		};
		return this.#flushMeta(true);
	};

	/** 編集の無い状態に戻す (サンプルの初期プロジェクトを読み込んだ直後など) */
	markPristine = (): Promise<void> => {
		this.meta = { ...emptyLocalDraftMeta(), adapters: this.meta.adapters };
		return this.#flushMeta(true);
	};

	getAdapterData = (moduleId: string): unknown => this.meta.adapters[moduleId];

	setAdapterData = (moduleId: string, data: unknown): void => {
		const adapters = { ...this.meta.adapters };
		if (data === undefined) delete adapters[moduleId];
		else adapters[moduleId] = data;
		this.meta = { ...this.meta, adapters };
		this.#scheduleMetaSave();
	};

	registerInspector = (inspector: LocalDraftInspector): (() => void) => {
		this.#inspectors.push(inspector);
		return () => {
			this.#inspectors = this.#inspectors.filter((candidate) => candidate !== inspector);
		};
	};

	/** スコープを開き終えるたびに呼ぶ。登録時点で開き終えていれば、直近の結果ですぐ呼ぶ */
	onOpened = (listener: (result: LocalDraftOpenResult) => void): (() => void) => {
		this.#listeners.add(listener);
		const last = this.#lastResult;
		if (last) queueMicrotask(() => this.#listeners.has(listener) && listener(last));
		return () => this.#listeners.delete(listener);
	};

	/** 復旧ダイアログの選択 */
	resolveRecovery = (choice: RecoveryChoice) => {
		this.#resolveRecovery?.(choice);
	};

	listUnsavedDrafts = async (): Promise<LocalDraftSummary[]> =>
		filterUnsavedDrafts(await this.storage.listDrafts());

	/** 予約中の書き込み (情報) をすぐに行う。ページを閉じるときに使う */
	flush = () => {
		void this.#flushMeta();
	};

	#enqueue<T>(task: () => Promise<T>): Promise<T> {
		const run = this.#queue.then(task, task);
		this.#queue = run.catch(() => {});
		return run;
	}

	async #open(
		scope: string | null,
		draft: LocalDraftStore,
		reload: boolean
	): Promise<LocalDraftOpenResult> {
		const stores = this.#stores;
		if (!stores) throw new Error('LocalDraftSession.start() has not been called.');
		this.opening = true;
		this.recovery = null;
		try {
			if (reload) {
				await this.#reloadStores(draft);
			}
			const [meta] = await Promise.all([
				draft.meta.load().catch(() => null),
				stores.style.ready,
				stores.icons.ready,
				stores.fonts.ready
			]);
			this.meta = meta ?? emptyLocalDraftMeta();

			let result: LocalDraftOpenResult['draft'] = 'none';
			if (this.storage.confirmUnsaved && hasUnsavedEdits(this.meta)) {
				const choice = await this.#askRecovery(scope);
				if (choice === 'discard') {
					await draft.clear();
					await this.#reloadStores(draft);
					this.meta = { ...emptyLocalDraftMeta(), adapters: {} };
					result = 'discarded';
				} else {
					result = 'restored';
				}
			}

			const opened: LocalDraftOpenResult = {
				scope,
				draft: result,
				meta: $state.snapshot(this.meta) as LocalDraftMeta
			};
			this.#lastResult = opened;
			for (const listener of this.#listeners) listener(opened);
			return opened;
		} finally {
			this.recovery = null;
			this.opening = false;
		}
	}

	#reloadStores(draft: LocalDraftStore): Promise<unknown> {
		const stores = this.#stores!;
		return Promise.all([
			stores.style.reload(draft.style, stores.initialStyle()),
			stores.icons.reload(draft.icons),
			stores.fonts.reload(draft.fonts)
		]);
	}

	#askRecovery(scope: string | null): Promise<RecoveryChoice> {
		const meta = $state.snapshot(this.meta) as LocalDraftMeta;
		// recovery は $state の proxy になるので、同じダイアログかどうかは番号で見る
		const prompt = ++this.#recoveryGeneration;
		this.recovery = { scope, meta, inspections: [], inspecting: this.#inspectors.length > 0 };
		void Promise.all(
			this.#inspectors.map(async (inspect) => {
				try {
					return (await inspect({ scope, meta })) ?? null;
				} catch (error) {
					console.error('[kartore] Draft inspector failed:', error);
					return null;
				}
			})
		).then((results) => {
			if (!this.recovery || prompt !== this.#recoveryGeneration) return;
			this.recovery = {
				...this.recovery,
				inspections: results.filter((result): result is LocalDraftInspection => result !== null),
				inspecting: false
			};
		});
		return new Promise((resolve) => {
			this.#resolveRecovery = (choice) => {
				this.#resolveRecovery = null;
				resolve(choice);
			};
		});
	}

	#scheduleMetaSave() {
		this.#metaDirty = true;
		if (this.#metaTimer !== null) clearTimeout(this.#metaTimer);
		this.#metaTimer = setTimeout(() => {
			this.#metaTimer = null;
			void this.#flushMeta();
		}, META_SAVE_DELAY_MS);
	}

	async #flushMeta(force = false): Promise<void> {
		if (this.#metaTimer !== null) {
			clearTimeout(this.#metaTimer);
			this.#metaTimer = null;
		}
		if (!force && !this.#metaDirty) return;
		this.#metaDirty = false;
		try {
			await this.#draft.meta.save($state.snapshot(this.meta) as LocalDraftMeta);
		} catch (error) {
			console.error('[kartore] Could not save the local draft metadata:', error);
		}
	}
}
