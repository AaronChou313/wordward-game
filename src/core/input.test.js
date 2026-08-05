import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupInput } from './input.js';
import {
  blurCanvasTextInput,
  focusCanvasTextInput,
} from '../ui/canvasTextInput.js';

function listenerTarget() {
  const listeners = new Map();
  return {
    addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
    dispatch(type) { listeners.get(type)?.({ preventDefault() {} }); },
  };
}

describe('canvas layout during mobile text input', () => {
  let canvas;
  let windowTarget;
  let input;

  beforeEach(() => {
    canvas = { ...listenerTarget(), style: {} };
    windowTarget = listenerTarget();
    Object.assign(windowTarget, {
      innerWidth: 390,
      innerHeight: 844,
      devicePixelRatio: 2,
      scrollX: 0,
      scrollY: 0,
      scrollTo: vi.fn(),
    });
    input = {
      style: {},
      value: '',
      focus: vi.fn(),
      blur: vi.fn(),
      removeAttribute: vi.fn(),
      setSelectionRange: vi.fn(),
    };
    vi.stubGlobal('window', windowTarget);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => input),
      body: { appendChild: vi.fn() },
    });
  });

  afterEach(() => {
    blurCanvasTextInput();
    vi.unstubAllGlobals();
  });

  it('freezes canvas size while the keyboard changes viewport height and resizes after blur', () => {
    const view = setupInput(canvas, { pointerDown() {}, pointerMove() {}, pointerUp() {} });
    expect(canvas.style.height).toBe('844px');
    expect(view.offsetY).toBeGreaterThanOrEqual(0);

    focusCanvasTextInput('', { maxLength: 64, onInput() {} });
    windowTarget.innerHeight = 500;
    windowTarget.dispatch('resize');

    expect(canvas.style.height).toBe('844px');

    blurCanvasTextInput();

    expect(canvas.style.height).toBe('500px');
  });
});

