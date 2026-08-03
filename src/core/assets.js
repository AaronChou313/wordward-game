// 素材接口：当前全部用代码程序化绘制占位；
// 后续接入美术素材时，把图片放入 assets/ 并在下方映射表登记，
// 调用方通过 getImage(name) 取图，取不到时回退到占位绘制。
const imageCache = {};
const IMAGE_MAP = {
  // 示例：'tower_bing': 'assets/tower_bing.png',
};

export function preloadImages(onDone) {
  const names = Object.keys(IMAGE_MAP);
  if (names.length === 0) { onDone && onDone(); return; }
  let loaded = 0;
  for (const name of names) {
    const img = new Image();
    img.onload = img.onerror = () => {
      loaded++;
      if (loaded >= names.length) onDone && onDone();
    };
    img.src = IMAGE_MAP[name];
    imageCache[name] = img;
  }
}

export function getImage(name) {
  return imageCache[name] || null;
}
