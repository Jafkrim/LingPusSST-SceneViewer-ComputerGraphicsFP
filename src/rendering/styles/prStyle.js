import * as THREE from 'three';
import { BaseRenderStyle } from './baseRenderStyle.js';

const TONE_MAPPING_MAP = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
};

export class PRStyle extends BaseRenderStyle {
  constructor({ pipeline, eventBus, config = {} }) {
    super({ id: 'pr', label: 'Photorealistic (PBR)', pipeline, eventBus });

    this.toneMappingKey = config.toneMapping ?? 'agx';
    this.toneMappingExposure = config.toneMappingExposure ?? 1.0;

    this.eventBus?.on('settings:graphicsChanged', (settings = {}) => {
      if (settings.toneMapping && settings.toneMapping in TONE_MAPPING_MAP) {
        this.toneMappingKey = settings.toneMapping;
        if (this.active) this._applyToneMapping(this.pipeline.renderer);
      }
      if (typeof settings.toneMappingExposure === 'number') {
        this.toneMappingExposure = settings.toneMappingExposure;
        if (this.active) this._applyToneMapping(this.pipeline.renderer);
      }
    });
  }

  _applyToneMapping(renderer) {
    if (!renderer) return;
    renderer.toneMapping = TONE_MAPPING_MAP[this.toneMappingKey] ?? THREE.AgXToneMapping;
    renderer.toneMappingExposure = this.toneMappingExposure;
  }

  activate() {
    super.activate();
    this._applyToneMapping(this.pipeline?.renderer);
  }

  render(renderer, scene, camera) {
    if (!renderer || !scene || !camera) return;

    if (this.pipeline?.composer) {
      this.pipeline.composer.render();
    } else {
      renderer.render(scene, camera);
    }
  }
}
