import { describe, expect, it } from 'vitest';

import { HostProviders } from './hostProviders.svelte.ts';

class FakeProvider {
	available = $state(true);
	constructor(readonly name: string) {}
}

describe('HostProviders', () => {
	it('has nothing before anything is registered', () => {
		const providers = new HostProviders<FakeProvider>();

		expect(providers.current).toBeUndefined();
		expect(providers.available).toEqual([]);
	});

	it('uses the last available provider', () => {
		const providers = new HostProviders<FakeProvider>();
		const first = new FakeProvider('first');
		const second = new FakeProvider('second');
		providers.register(first);
		providers.register(second);

		expect(providers.current).toBe(second);
		second.available = false;
		expect(providers.current).toBe(first);
		expect(providers.available).toEqual([first]);
	});
});
