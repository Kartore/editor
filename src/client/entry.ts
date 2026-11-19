import { mount } from 'svelte';
import { appVersion, base } from 'virtual:kartore-app';
import storageConfig from 'virtual:kartore-storage';

import App from './App.svelte';

import './app.css';

// 旧 SvelteKit の app.html と同じく display: contents のラッパーにマウントする
const target = document.createElement('div');
target.style.display = 'contents';
document.body.append(target);

// 最初に開くスコープ (関数なら起動時に解決する)
const scopeOption = storageConfig?.scope;
const scope = typeof scopeOption === 'function' ? await scopeOption() : (scopeOption ?? null);

mount(App, { target, props: { appVersion, base, storage: storageConfig?.storage, scope } });
