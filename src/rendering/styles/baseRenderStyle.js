export class BaseRenderStyle {
  constructor(renderer, scene, camera, eventBus) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.eventBus = eventBus;
  }

  activate() {}

  deactivate() {}

  resize(width, height) {}

  update(dt) {}

  render(dt) {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {}
}
