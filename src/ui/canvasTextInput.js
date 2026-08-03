let input = null;

export function focusCanvasTextInput(value, options) {
  if (typeof document === 'undefined') return;
  if (!input) {
    input = document.createElement('input');
    input.autocomplete = 'off';
    input.autocapitalize = 'none';
    Object.assign(input.style, {
      position: 'fixed', left: '50%', bottom: '8px', width: '2px', height: '2px',
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
  input.focus({ preventScroll: true });
  input.setSelectionRange(input.value.length, input.value.length);
}

export function blurCanvasTextInput() {
  if (input) input.blur();
}
