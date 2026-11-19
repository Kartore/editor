import { normalizePropertiesPanelWidth, normalizeSidebarWidth } from './sidebarSize.ts';

const SHELL_STORAGE_KEY = 'kartore:shell';

/** 左パネルの開閉と、左右パネルの幅。localStorage (`kartore:shell`) に保存する */
export class ShellLayout {
	leftCollapsed = $state(false);
	sidebarWidth = $state(normalizeSidebarWidth(undefined));
	propertiesPanelWidth = $state(normalizePropertiesPanelWidth(undefined));

	/** 保存した値を読む (onMount で呼ぶ) */
	restore = () => {
		try {
			const stored = JSON.parse(localStorage.getItem(SHELL_STORAGE_KEY) ?? '{}') as {
				leftCollapsed?: unknown;
				sidebarWidth?: unknown;
				propertiesPanelWidth?: unknown;
			};
			this.leftCollapsed = stored.leftCollapsed === true;
			this.sidebarWidth = normalizeSidebarWidth(stored.sidebarWidth);
			this.propertiesPanelWidth = normalizePropertiesPanelWidth(stored.propertiesPanelWidth);
		} catch {
			this.leftCollapsed = false;
			this.sidebarWidth = normalizeSidebarWidth(undefined);
			this.propertiesPanelWidth = normalizePropertiesPanelWidth(undefined);
		}
	};

	setLeftCollapsed = (collapsed: boolean) => {
		this.leftCollapsed = collapsed;
		this.#persist();
	};

	finishSidebarResize = (width: number) => {
		this.sidebarWidth = normalizeSidebarWidth(width);
		this.#persist();
	};

	finishPropertiesPanelResize = (width: number) => {
		this.propertiesPanelWidth = normalizePropertiesPanelWidth(width);
		this.#persist();
	};

	#persist() {
		localStorage.setItem(
			SHELL_STORAGE_KEY,
			JSON.stringify({
				leftCollapsed: this.leftCollapsed,
				sidebarWidth: this.sidebarWidth,
				propertiesPanelWidth: this.propertiesPanelWidth
			})
		);
	}
}
