import { describe, expect, it, vi } from 'vitest';

import { dispatchKartoreRequest, isCsrfForbidden } from './core.ts';
import { memoryKv } from './kv.ts';
import { createRuntimeBase, type AdapterApiHandler, type RuntimeFactory } from './runtime.ts';

const origin = 'https://app.example.com';

const echoHandler: AdapterApiHandler = {
	id: 'echo',
	requiredEnv: ['SECRET'],
	fetch: (request, runtime) =>
		Response.json({ method: request.method, origin: runtime.origin, secret: runtime.env.SECRET })
};

const runtimeFactory =
	(env: Record<string, string | undefined> = { SECRET: 's' }): RuntimeFactory =>
	(request, handler) =>
		createRuntimeBase({
			request,
			env,
			kv: memoryKv(),
			waitUntil: () => {},
			platform: 'test',
			handlerId: handler.id
		});

const dispatch = (request: Request, env?: Record<string, string | undefined>) =>
	dispatchKartoreRequest(request, runtimeFactory(env), [echoHandler]);

describe('dispatchKartoreRequest', () => {
	it('returns null outside /api/', async () => {
		expect(await dispatch(new Request(`${origin}/foo/bar`))).toBeNull();
		expect(await dispatch(new Request(`${origin}/apix`))).toBeNull();
	});

	it('returns 404 for an unknown handler id', async () => {
		const response = await dispatch(new Request(`${origin}/api/unknown/me`));
		expect(response?.status).toBe(404);
	});

	it('calls the handler with the runtime', async () => {
		const response = await dispatch(new Request(`${origin}/api/echo/me`));
		expect(await response?.json()).toEqual({ method: 'GET', origin, secret: 's' });
	});

	it('returns 500 missing_env without calling the handler', async () => {
		const fetch = vi.fn();
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const response = await dispatchKartoreRequest(
			new Request(`${origin}/api/echo/me`),
			runtimeFactory({}),
			[{ ...echoHandler, fetch }]
		);
		expect(response?.status).toBe(500);
		expect(await response?.json()).toEqual({ error: 'missing_env', keys: ['SECRET'] });
		expect(fetch).not.toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	describe('base', () => {
		const pathHandler: AdapterApiHandler = {
			id: 'echo',
			fetch: async (request, runtime) =>
				Response.json({
					method: request.method,
					path: new URL(request.url).pathname,
					search: new URL(request.url).search,
					contentType: request.headers.get('content-type'),
					body: request.body ? await request.text() : null,
					aborted: request.signal.aborted,
					base: runtime.base,
					callback: runtime.url('/api/echo/auth/callback'),
					page: runtime.url('echo/preview')
				})
		};
		const factory: RuntimeFactory = (request, handler) =>
			createRuntimeBase({
				request,
				env: {},
				kv: memoryKv(),
				waitUntil: () => {},
				platform: 'test',
				handlerId: handler.id,
				base: '/studio/'
			});
		const dispatchUnder = (request: Request) =>
			dispatchKartoreRequest(request, factory, [pathHandler], '/studio/');

		it('passes <base>api/<id>/... to the adapter as /api/<id>/...', async () => {
			const response = await dispatchUnder(new Request(`${origin}/studio/api/echo/me?x=1`));
			expect(await response?.json()).toEqual({
				method: 'GET',
				path: '/api/echo/me',
				search: '?x=1',
				contentType: null,
				body: null,
				aborted: false,
				base: '/studio/',
				callback: `${origin}/studio/api/echo/auth/callback`,
				page: `${origin}/studio/echo/preview`
			});
		});

		it('keeps the method, headers and body when rewriting the URL', async () => {
			const response = await dispatchUnder(
				new Request(`${origin}/studio/api/echo/save`, {
					method: 'PUT',
					headers: { origin, 'content-type': 'application/json' },
					body: '{"a":1}'
				})
			);
			expect(await response?.json()).toMatchObject({
				method: 'PUT',
				path: '/api/echo/save',
				contentType: 'application/json',
				body: '{"a":1}'
			});
		});

		it('keeps the abort signal', async () => {
			const controller = new AbortController();
			let seen: AbortSignal | null = null;
			await dispatchKartoreRequest(
				new Request(`${origin}/studio/api/echo/me`, { signal: controller.signal }),
				factory,
				[{ id: 'echo', fetch: (request) => ((seen = request.signal), new Response('ok')) }],
				'/studio/'
			);
			controller.abort();
			expect(seen!.aborted).toBe(true);
		});

		it('ignores paths outside the base, including the root /api/', async () => {
			expect(await dispatchUnder(new Request(`${origin}/api/echo/me`))).toBeNull();
			expect(await dispatchUnder(new Request(`${origin}/studio/echo/preview`))).toBeNull();
			expect(await dispatchUnder(new Request(`${origin}/studio-x/api/echo/me`))).toBeNull();
			expect(await dispatchUnder(new Request(`${origin}/studio/`))).toBeNull();
		});

		it('returns 404 for an unknown handler under the base', async () => {
			expect((await dispatchUnder(new Request(`${origin}/studio/api/nope/x`)))?.status).toBe(404);
		});

		it('defaults runtime.base to / and builds URLs from the root', () => {
			const runtime = runtimeFactory()(new Request(`${origin}/api/echo/me`), echoHandler);
			expect(runtime.base).toBe('/');
			expect(runtime.url('/api/echo/auth/callback')).toBe(`${origin}/api/echo/auth/callback`);
			expect(runtime.url()).toBe(`${origin}/`);
		});
	});

	describe('CSRF', () => {
		const post = (headers: Record<string, string>, body?: string) =>
			new Request(`${origin}/api/echo/action`, { method: 'POST', headers, body });

		it('rejects a cross-site form POST with 403', async () => {
			const response = await dispatch(
				post(
					{ origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' },
					'a=1'
				)
			);
			expect(response?.status).toBe(403);
			expect(await response?.text()).toBe('Cross-site POST form submissions are forbidden');
		});

		it('rejects a cross-site POST without content-type, as JSON when accepted', async () => {
			const response = await dispatch(
				post({ origin: 'https://evil.example', accept: 'application/json' })
			);
			expect(response?.status).toBe(403);
			expect(await response?.json()).toEqual({
				message: 'Cross-site POST form submissions are forbidden'
			});
		});

		it('allows same-origin form POST and cross-site JSON POST', async () => {
			expect((await dispatch(post({ origin, 'content-type': 'text/plain' }, 'x')))?.status).toBe(
				200
			);
			expect(
				(
					await dispatch(
						post({ origin: 'https://github.com', 'content-type': 'application/json' }, '{}')
					)
				)?.status
			).toBe(200);
		});

		it('allows the request origin even when PUBLIC_ORIGIN points elsewhere (wrangler vars in dev)', async () => {
			const local = new Request('http://localhost:5174/api/echo/logout', {
				method: 'POST',
				headers: { origin: 'http://localhost:5174' }
			});
			const response = await dispatchKartoreRequest(
				local,
				runtimeFactory({ SECRET: 's', PUBLIC_ORIGIN: 'https://app.kartore.io' }),
				[echoHandler]
			);
			expect(response?.status).toBe(200);
		});

		it('ignores GET and uses PUBLIC_ORIGIN as the self origin', () => {
			const get = new Request(`${origin}/api/echo/me`, { headers: { origin: 'https://evil' } });
			expect(isCsrfForbidden(get, origin)).toBe(false);
			const proxied = new Request('http://127.0.0.1:3000/api/echo/x', {
				method: 'DELETE',
				headers: { origin }
			});
			const runtime = runtimeFactory({ PUBLIC_ORIGIN: `${origin}/` })(proxied, echoHandler);
			expect(isCsrfForbidden(proxied, runtime.origin)).toBe(false);
		});
	});
});
