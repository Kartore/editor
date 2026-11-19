import { stripBase } from '../utils/basePath.ts';
import type { AdapterApiHandler, RuntimeFactory } from './runtime.ts';

/** handler の requiredEnv のうち、env に無い (空文字含む) キー */
export const missingEnvKeys = (
	handler: Pick<AdapterApiHandler, 'requiredEnv'>,
	env: Readonly<Record<string, string | undefined>>
): string[] => (handler.requiredEnv ?? []).filter((key) => !env[key]);

// SvelteKit 3.0.0-next.25 の is_csrf_forbidden (src/runtime/server/csrf.js) と同じ規則
const csrfMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const formContentTypes = [
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
	'application/x-sveltekit-formdata'
];

const isFormContentType = (request: Request): boolean => {
	const type = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
	return !type || formContentTypes.includes(type);
};

/**
 * form 系 (Content-Type 無しを含む) の状態変更リクエストで、Origin が self origin のどれとも違えば true。
 * self origin は request 自身の origin (SvelteKit と同じ) と公開 origin (PUBLIC_ORIGIN。リバースプロキシ配下用)。
 * PUBLIC_ORIGIN は wrangler の vars として dev でも入るので、request の origin も必ず許可する
 */
export const isCsrfForbidden = (request: Request, publicOrigin: string): boolean => {
	if (!csrfMethods.has(request.method) || !isFormContentType(request)) return false;
	const origin = request.headers.get('origin');
	return origin !== new URL(request.url).origin && origin !== publicOrigin;
};

export const csrfForbiddenResponse = (request: Request): Response => {
	const message = `Cross-site ${request.method} form submissions are forbidden`;
	return (request.headers.get('accept') ?? '').includes('application/json')
		? Response.json({ message }, { status: 403 })
		: new Response(message, { status: 403 });
};

/**
 * URL から base を取った Request を作り直す。メソッド・ヘッダ・本文 (stream のまま)・signal・redirect を引き継ぐ
 * (`new Request(url, request)` は Node (undici) で本文つきだと duplex が要るため、明示して渡す)
 */
export const withPathname = (request: Request, pathname: string): Request => {
	const url = new URL(request.url);
	url.pathname = pathname;
	return new Request(url, {
		method: request.method,
		headers: request.headers,
		body: request.body,
		signal: request.signal,
		redirect: request.redirect,
		duplex: 'half'
	} as RequestInit);
};

/**
 * `<base>api/<id>/...` を handlers に振り分ける。処理順:
 * 1. `<base>api/` 以外 → null
 * 2. id の handler が無い → 404
 * 3. runtime を作り、CSRF (self origin = request の origin か runtime.origin) → 403
 * 4. requiredEnv の欠落 → 500 `{ error: 'missing_env', keys }`
 * 5. handler.fetch(request, runtime)。request の URL は base を取ったもの (`/api/<id>/...`)
 */
export const dispatchKartoreRequest = async (
	request: Request,
	createRuntime: RuntimeFactory,
	handlers: readonly AdapterApiHandler[],
	base = '/'
): Promise<Response | null> => {
	const pathname = stripBase(new URL(request.url).pathname, base);
	if (pathname === null || !pathname.startsWith('/api/')) return null;

	const handlerId = pathname.split('/')[2];
	const handler = handlers.find(({ id }) => id === handlerId);
	if (!handler) return new Response('Not found', { status: 404 });

	const runtime = createRuntime(request, handler);
	if (isCsrfForbidden(request, runtime.origin)) return csrfForbiddenResponse(request);

	const missing = missingEnvKeys(handler, runtime.env);
	if (missing.length > 0) {
		console.error(`[kartore] Adapter "${handler.id}" is missing env: ${missing.join(', ')}`);
		return Response.json({ error: 'missing_env', keys: missing }, { status: 500 });
	}

	return handler.fetch(base === '/' ? request : withPathname(request, pathname), runtime);
};
