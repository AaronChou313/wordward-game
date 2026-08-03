// 音效占位：WebAudio 合成简单打击音，后续可替换为真实音频文件
let ctx = null;
let masterVolume = 0.8;

function ensureCtx() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
  }
  return ctx;
}

function beep(freq, dur, type, vol) {
  if (masterVolume <= 0) return;
  const ac = ensureCtx();
  if (!ac) return;
  if (ac.state === 'suspended') ac.resume();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type || 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime((vol || 0.08) * masterVolume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + dur);
}

export const Audio = {
  setVolume(v) { masterVolume = Math.max(0, Math.min(1, v)); },
  getVolume() { return masterVolume; },
  hit() { beep(220, 0.08, 'square', 0.05); },
  boom() { beep(90, 0.25, 'sawtooth', 0.12); },
  kill() { beep(520, 0.1, 'triangle', 0.07); },
  place() { beep(340, 0.1, 'triangle', 0.08); },
  merge() { beep(440, 0.15, 'sine', 0.1); setTimeout(() => beep(660, 0.15, 'sine', 0.1), 90); },
  hero() { beep(392, 0.2, 'sine', 0.12); setTimeout(() => beep(523, 0.2, 'sine', 0.12), 120); setTimeout(() => beep(784, 0.3, 'sine', 0.12), 240); },
  coin() { beep(880, 0.1, 'sine', 0.08); },
  hurt() { beep(140, 0.3, 'sawtooth', 0.12); },
  click() { beep(600, 0.05, 'square', 0.04); },
};
