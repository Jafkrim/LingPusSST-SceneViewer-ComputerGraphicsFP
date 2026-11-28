import { BaseRenderStyle } from './baseRenderStyle.js';

export class ViewModeStyle extends BaseRenderStyle {
  constructor({ id = 'viewMode', label = 'View Mode', eventBus = null, defaultMode = 1 } = {}) {
    super({ id, label });
    this.eventBus = eventBus;
    this.mode = Number(defaultMode) || 1;
    this._unsub = this.eventBus?.on?.('view:setMode', ({ mode } = {}) => {
      this.setMode(mode);
    });
  }

  setMode(mode) {
    const next = Number(mode);
    if (Number.isInteger(next) && next >= 1 && next <= 6) {
      this.mode = next;
    }
  }

  render(renderer, scene, camera) {
    // Skeleton: implement per-mode shading passes (1: Lit, 2: Unlit, 3: Wireframe, 4: Lighting, 5: Reflection, 6: Collision)
    renderer.render(scene, camera);
  }

  dispose() {
    this._unsub?.();
    this._unsub = null;
  }
}
