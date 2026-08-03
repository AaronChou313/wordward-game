// 固定步长游戏循环
export function startLoop(update, render) {
  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 60;

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25; // 切后台回来不跳变
    acc += dt;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
