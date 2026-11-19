import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	handleEditorShortcut,
	type EditorShortcutActions,
	type EditorShortcutState
} from './editorShortcuts.ts';

const baseState: EditorShortcutState = {
	colorVisionActive: false,
	inspectActive: false,
	blocked: false,
	activeShellMode: 'layers',
	historyAvailable: false,
	leftShellCollapsed: false
};

// vitest は node 環境なので、KeyboardEvent の代わりに必要なところだけを持つ偽物を使う
type FakeKeyInit = Partial<
	Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'repeat'>
>;
const fakeEvent = (init: FakeKeyInit, target: unknown) => {
	const event = {
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		repeat: false,
		...init,
		target,
		defaultPrevented: false,
		preventDefault() {
			event.defaultPrevented = true;
		}
	};
	return event;
};

class FakeElement {
	constructor(private readonly editable: boolean) {}
	closest() {
		return this.editable ? this : null;
	}
}

afterEach(() => {
	vi.unstubAllGlobals();
});

const setup = (init: FakeKeyInit, state: Partial<EditorShortcutState> = {}, target?: unknown) => {
	const actions = Object.fromEntries(
		[
			'newStyle',
			'save',
			'openCommandPalette',
			'exitColorVision',
			'endInspect',
			'toggleInspect',
			'showMode',
			'setLeftShellCollapsed',
			'deleteLayer',
			'undo',
			'redo'
		].map((name) => [name, vi.fn()])
	) as unknown as Record<keyof EditorShortcutActions, ReturnType<typeof vi.fn>>;
	const event = fakeEvent(init, target ?? null);
	handleEditorShortcut(
		event as unknown as KeyboardEvent,
		{ ...baseState, ...state },
		actions as unknown as EditorShortcutActions
	);
	return { actions, event };
};

describe('handleEditorShortcut', () => {
	it('handles command shortcuts and ignores key repeat', () => {
		expect(setup({ key: 's', metaKey: true }).actions.save).toHaveBeenCalled();
		const repeated = setup({ key: 's', ctrlKey: true, repeat: true });
		expect(repeated.actions.save).not.toHaveBeenCalled();
		expect(repeated.event.defaultPrevented).toBe(true);
		expect(setup({ key: 'z', metaKey: true }).actions.undo).toHaveBeenCalled();
		expect(setup({ key: 'z', metaKey: true, shiftKey: true }).actions.redo).toHaveBeenCalled();
		expect(setup({ key: '.', metaKey: true }).actions.setLeftShellCollapsed).toHaveBeenCalledWith(
			true
		);
	});

	it('switches rail modes, but not to history when it is unavailable', () => {
		expect(setup({ key: '3', metaKey: true }).actions.showMode).toHaveBeenCalledWith('sources');
		const history = setup({ key: '6', metaKey: true });
		expect(history.actions.showMode).not.toHaveBeenCalled();
		expect(history.event.defaultPrevented).toBe(false);
		expect(
			setup({ key: '6', metaKey: true }, { historyAvailable: true }).actions.showMode
		).toHaveBeenCalledWith('history');
	});

	it('prefers leaving color vision, then inspect, on Escape', () => {
		const both = setup({ key: 'Escape' }, { colorVisionActive: true, inspectActive: true });
		expect(both.actions.exitColorVision).toHaveBeenCalled();
		expect(both.actions.endInspect).not.toHaveBeenCalled();
		expect(setup({ key: 'Escape' }, { inspectActive: true }).actions.endInspect).toHaveBeenCalled();
	});

	it('ignores single-key shortcuts in inputs and while blocked, but keeps command shortcuts', () => {
		vi.stubGlobal('HTMLElement', FakeElement);
		const input = new FakeElement(true);
		expect(setup({ key: 'i' }, {}, input).actions.toggleInspect).not.toHaveBeenCalled();
		expect(setup({ key: 'i' }, { blocked: true }).actions.toggleInspect).not.toHaveBeenCalled();
		expect(setup({ key: 'i' }).actions.toggleInspect).toHaveBeenCalled();
		expect(setup({ key: 'n', metaKey: true }, {}, input).actions.newStyle).toHaveBeenCalled();
	});

	it('deletes the layer only in the layers mode and not on repeat', () => {
		expect(setup({ key: 'Delete' }).actions.deleteLayer).toHaveBeenCalled();
		expect(setup({ key: 'Backspace', repeat: true }).actions.deleteLayer).not.toHaveBeenCalled();
		expect(
			setup({ key: 'Delete' }, { activeShellMode: 'palette' }).actions.deleteLayer
		).not.toHaveBeenCalled();
		expect(setup({ key: '/' }).actions.openCommandPalette).toHaveBeenCalled();
	});
});
