let input = null;
let active = false;
const stateListeners = new Set();

export function isCanvasTextInputActive() {
  return active;
}

export function subscribeCanvasTextInputState(listener) {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

function setActive(next) {
  if (active === next) return;
  active = next;
  for (const listener of stateListeners) listener(active);
}

export function focusCanvasTextInput(value, options) {
  if (typeof document === 'undefined') return;
  if (!input) {
    input = document.createElement('input');
    input.autocomplete = 'off';
    input.autocapitalize = 'none';
    Object.assign(input.style, {
      position: 'fixed', left: '50%', top: '0', bottom: 'auto', width: '2px', height: '2px',
      opacity: '0.01', border: '0', padding: '0', zIndex: '10',
    });
    document.body.appendChild(input);
  }
  input.type = options.password ? 'password' : 'text';
  input.removeAttribute('maxlength');
  input.value = value;
  input.oninput = () => {
    const limited = Array.from(input.value).slice(0, options.maxLength).join('');
    if (limited !== input.value) input.value = limited;
    options.onInput(limited);
  };
  input.onkeydown = (event) => {
    if (event.key === 'Enter' && options.onEnter) {
      event.preventDefault();
      options.onEnter();
    }
  };
  input.onblur = () => setActive(false);
  const scrollX = window.scrollX || 0;
  const scrollY = window.scrollY || 0;
  setActive(true);
  input.focus({ preventScroll: true });
  window.scrollTo(scrollX, scrollY);
  input.setSelectionRange(input.value.length, input.value.length);
}

export function blurCanvasTextInput() {
  if (input) input.blur();
  setActive(false);
}
