export class BaseRenderStyle {
  constructor({ id, label, pipeline, eventBus }) {
    this.id = id;
    this.label = label ?? id;
    this.pipeline = pipeline;
    this.eventBus = eventBus;
    this.active = false;
  }

  activate() {
    this.active = true;
  }

  deactivate() {
    this.active = false;
  }

  update(_dt, _ctx) {}

  render(_renderer, _scene, _camera) {}

  resize(_width, _height, _pixelRatio) {}

  dispose() {
    this.active = false;
  }
}
