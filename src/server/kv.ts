/// <reference types="node" />
import type { KartoreKv, KartoreKvPutOptions } from './runtime.ts';

/**
 * Node 等で使う KV 実装。名前空間化・TTL の切り上げは runtime 側 (createRuntimeBase) が行うので、ここは素の KV。
 * Redis 等を使う場合はホストが KartoreKv を実装して startNodeServer({ kv }) に渡す
 */

const expiresAtOf = (options: KartoreKvPutOptions | undefined, now: number): number | null =>
	options?.ttlSeconds === undefined ? null : now + options.ttlSeconds * 1000;

const parseJson = <T>(value: string | null): T | null =>
	value === null ? null : (JSON.parse(value) as T);

/** プロセス内メモリの KV (再起動で消える。開発・単一プロセス用) */
export const memoryKv = (now: () => number = Date.now): KartoreKv => {
	const store = new Map<string, { value: string; expiresAt: number | null }>();
	const get = async (key: string) => {
		const entry = store.get(key);
		if (!entry) return null;
		if (entry.expiresAt !== null && entry.expiresAt <= now()) {
			store.delete(key);
			return null;
		}
		return entry.value;
	};
	return {
		get,
		getJson: async <T = unknown>(key: string) => parseJson<T>(await get(key)),
		async put(key, value, options) {
			store.set(key, { value, expiresAt: expiresAtOf(options, now()) });
		},
		async delete(key) {
			store.delete(key);
		}
	};
};

type SqliteStatement = {
	get(...params: unknown[]): unknown;
	run(...params: unknown[]): unknown;
};
type SqliteDatabase = {
	exec(sql: string): void;
	prepare(sql: string): SqliteStatement;
};

/**
 * `node:sqlite` (Node 22.13+ / 23.4+) を使うファイル KV。ディレクトリは自動で作る。
 * 期限切れは読み出し時に消す
 */
export const sqliteKv = (filename: string, now: () => number = Date.now): KartoreKv => {
	let db: Promise<SqliteDatabase> | null = null;
	const open = () =>
		(db ??= (async () => {
			const [{ DatabaseSync }, { mkdirSync }, path] = await Promise.all([
				import('node:sqlite'),
				import('node:fs'),
				import('node:path')
			]);
			if (filename !== ':memory:')
				mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
			const database = new DatabaseSync(filename) as unknown as SqliteDatabase;
			database.exec(
				'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER)'
			);
			return database;
		})());

	const get = async (key: string) => {
		const database = await open();
		const row = database.prepare('SELECT value, expires_at FROM kv WHERE key = ?').get(key) as
			{ value: string; expires_at: number | null } | undefined;
		if (!row) return null;
		if (row.expires_at !== null && row.expires_at <= now()) {
			database.prepare('DELETE FROM kv WHERE key = ?').run(key);
			return null;
		}
		return row.value;
	};

	return {
		get,
		getJson: async <T = unknown>(key: string) => parseJson<T>(await get(key)),
		async put(key, value, options) {
			(await open())
				.prepare(
					'INSERT INTO kv (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at'
				)
				.run(key, value, expiresAtOf(options, now()));
		},
		async delete(key) {
			(await open()).prepare('DELETE FROM kv WHERE key = ?').run(key);
		}
	};
};
