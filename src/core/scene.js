// 场景管理器：场景需实现 enter/exit/update/render/onPointerDown/onPointerMove/onPointerUp
export class SceneManager {
  constructor() {
    this.scenes = {};
    this.current = null;
    this.currentName = '';
  }

  register(name, scene) {
    this.scenes[name] = scene;
  }

  switch(name, params) {
    if (this.current && this.current.exit) this.current.exit();
    this.current = this.scenes[name];
    this.currentName = name;
    if (this.current.enter) this.current.enter(params || {});
  }

  update(dt) {
    if (this.current && this.current.update) this.current.update(dt);
  }

  render(ctx) {
    if (this.current && this.current.render) this.current.render(ctx);
  }

  pointerDown(x, y) { if (this.current && this.current.onPointerDown) this.current.onPointerDown(x, y); }
  pointerMove(x, y) { if (this.current && this.current.onPointerMove) this.current.onPointerMove(x, y); }
  pointerUp(x, y) { if (this.current && this.current.onPointerUp) this.current.onPointerUp(x, y); }
}
