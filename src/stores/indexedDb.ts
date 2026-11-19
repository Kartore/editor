/** IndexedDB の request / transaction を Promise にする小さなヘルパ */

export const requestError = (request: IDBRequest, fallback: string): Error =>
	request.error ?? new Error(fallback);

export const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
	new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(requestError(request, 'IndexedDB request failed.'));
	});

export const transactionComplete = (transaction: IDBTransaction): Promise<void> =>
	new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () =>
			reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
		transaction.onabort = () =>
			reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
	});

export type IndexedDbFactoryProvider = () => IDBFactory | undefined;

/** 必要な object store を作りながら DB を開く。失敗したら次回やり直す */
export const createDatabaseOpener = ({
	name,
	version,
	stores,
	getFactory = () => globalThis.indexedDB
}: {
	name: string;
	version: number;
	stores: readonly string[];
	getFactory?: IndexedDbFactoryProvider;
}): (() => Promise<IDBDatabase>) => {
	let databasePromise: Promise<IDBDatabase> | undefined;
	return () => {
		if (databasePromise) return databasePromise;
		const opening = new Promise<IDBDatabase>((resolve, reject) => {
			const factory = getFactory();
			if (!factory) {
				reject(new Error('IndexedDB is not available.'));
				return;
			}
			const request = factory.open(name, version);
			request.onupgradeneeded = () => {
				for (const store of stores) {
					if (!request.result.objectStoreNames.contains(store)) {
						request.result.createObjectStore(store);
					}
				}
			};
			request.onsuccess = () => {
				const database = request.result;
				database.onversionchange = () => database.close();
				resolve(database);
			};
			request.onerror = () => reject(requestError(request, `Could not open ${name}.`));
			request.onblocked = () => reject(new Error(`Opening ${name} was blocked.`));
		});
		databasePromise = opening.catch((error: unknown) => {
			databasePromise = undefined;
			throw error;
		});
		return databasePromise;
	};
};
