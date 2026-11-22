/** アダプタが登録するもの (available を getter で持つ) を集めて、リアクティブに読めるようにする */
export class HostProviders<T extends { readonly available: boolean }> {
	#items = $state<T[]>([]);

	register = (item: T): void => {
		this.#items = [...this.#items, item];
	};

	/** available なもの (登録順) */
	get available(): T[] {
		return this.#items.filter((item) => item.available);
	}

	/** 最後に登録した available なもの */
	get current(): T | undefined {
		return this.#items.findLast((item) => item.available);
	}
}
