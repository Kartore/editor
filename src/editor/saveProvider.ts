import type { SaveProvider } from './EditorModule.ts';

export const dispatchSave = (
	providers: readonly SaveProvider[],
	fallback: () => void | Promise<void>
): void | boolean | Promise<void | boolean> => {
	const provider = providers.find((candidate) => candidate.available);
	return provider ? provider.save() : fallback();
};
