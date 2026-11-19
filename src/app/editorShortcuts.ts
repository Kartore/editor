import type { ShellMode } from '#src/components/shell/shellMode.ts';

export type EditorShortcutState = {
	colorVisionActive: boolean;
	inspectActive: boolean;
	/** ダイアログ・レイヤー追加・ドラッグ中など、単キーのショートカットを止めたいとき */
	blocked: boolean;
	activeShellMode: ShellMode;
	historyAvailable: boolean;
	leftShellCollapsed: boolean;
};

export type EditorShortcutActions = {
	newStyle: () => void;
	save: () => void;
	openCommandPalette: () => void;
	exitColorVision: () => void;
	endInspect: () => void;
	toggleInspect: () => void;
	showMode: (mode: ShellMode) => void;
	setLeftShellCollapsed: (collapsed: boolean) => void;
	deleteLayer: () => void;
	undo: () => void;
	redo: () => void;
};

const shellModeKeys: Record<string, ShellMode> = {
	'1': 'layers',
	'2': 'palette',
	'3': 'sources',
	'4': 'sprites',
	'5': 'fonts',
	'6': 'history'
};

// 入力欄・コードエディタ・ダイアログの中では単キーのショートカットを使わない
const editableTargetSelector =
	'input, textarea, select, [contenteditable="true"], .cm-editor, [role="dialog"], [role="alertdialog"]';

/** エディタ全体のキーボードショートカット (window の keydown) */
export const handleEditorShortcut = (
	event: KeyboardEvent,
	state: EditorShortcutState,
	actions: EditorShortcutActions
): void => {
	const command = event.metaKey || event.ctrlKey;
	const key = event.key.toLowerCase();
	const plainCommand = command && !event.altKey && !event.shiftKey;

	if (plainCommand && key === 'n') {
		event.preventDefault();
		if (!event.repeat) actions.newStyle();
		return;
	}
	if (plainCommand && key === 's') {
		event.preventDefault();
		if (!event.repeat) actions.save();
		return;
	}
	if (plainCommand && key === 'k') {
		event.preventDefault();
		if (!event.repeat) actions.openCommandPalette();
		return;
	}
	if (!command && !event.altKey && event.key === 'Escape' && state.colorVisionActive) {
		event.preventDefault();
		if (!event.repeat) actions.exitColorVision();
		return;
	}
	if (!command && !event.altKey && event.key === 'Escape' && state.inspectActive) {
		event.preventDefault();
		if (!event.repeat) actions.endInspect();
		return;
	}

	const target = event.target;
	if (
		typeof HTMLElement !== 'undefined' &&
		target instanceof HTMLElement &&
		target.closest(editableTargetSelector)
	) {
		return;
	}
	if (state.blocked) return;

	if (!command && !event.altKey && !event.shiftKey && key === 'i') {
		event.preventDefault();
		if (!event.repeat) actions.toggleInspect();
		return;
	}

	if (plainCommand && /^[1-6]$/.test(event.key)) {
		const mode = shellModeKeys[event.key];
		if (mode === 'history' && !state.historyAvailable) return;
		event.preventDefault();
		if (!event.repeat) actions.showMode(mode);
		return;
	}

	if (plainCommand && event.key === '.') {
		event.preventDefault();
		if (!event.repeat) actions.setLeftShellCollapsed(!state.leftShellCollapsed);
		return;
	}

	if (!command && !event.altKey && event.key === '/') {
		event.preventDefault();
		actions.openCommandPalette();
		return;
	}

	if (
		!command &&
		!event.altKey &&
		!event.shiftKey &&
		state.activeShellMode === 'layers' &&
		(event.key === 'Backspace' || event.key === 'Delete')
	) {
		if (event.repeat) return;
		event.preventDefault();
		actions.deleteLayer();
		return;
	}

	if (!command || key !== 'z') return;
	event.preventDefault();
	if (event.shiftKey) actions.redo();
	else actions.undo();
};
