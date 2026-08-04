import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  blurCanvasTextInput,
  focusCanvasTextInput,
  isCanvasTextInputActive,
  subscribeCanvasTextInputState,
} from './canvasTextInput.js';

function fakeInput() {
  return {
    style: {},
    dataset: {},
    value: '',
    focus: vi.fn(),
    blur: vi.fn(),
    removeAttribute: vi.fn(),
    setSelectionRange: vi.fn(),
  };
}

describe('canvas text input viewport behavior', () => {
  let input;
  let appendChild;
  let scrollTo;

  beforeEach(() => {
    input = fakeInput();
    appendChild = vi.fn();
    scrollTo = vi.fn();
    vi.stubGlobal('document', {
      createElement: vi.fn(() => input),
      body: { appendChild },
    });
    vi.stubGlobal('window', { scrollX: 7, scrollY: 11, scrollTo });
  });

  afterEach(() => {
    blurCanvasTextInput();
    vi.unstubAllGlobals();
  });

  it('keeps the hidden input at a top-safe fixed position and restores scroll after focus', () => {
    focusCanvasTextInput('', { maxLength: 64, onInput() {} });

    expect(input.style).toMatchObject({
      position: 'fixed',
      top: '0',
      bottom: 'auto',
    });
    expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrollTo).toHaveBeenCalledWith(7, 11);
  });

  it('notifies subscribers while input is active and after blur', () => {
    const states = [];
    const unsubscribe = subscribeCanvasTextInputState((active) => states.push(active));

    focusCanvasTextInput('', { maxLength: 64, onInput() {} });
    expect(isCanvasTextInputActive()).toBe(true);

    blurCanvasTextInput();
    expect(isCanvasTextInputActive()).toBe(false);
    expect(states).toEqual([true, false]);

    unsubscribe();
  });
});

