import * as THREE from 'three';
import { BaseRenderStyle } from './baseRenderStyle.js';

export class PrStyle extends BaseRenderStyle {
  constructor(renderer, scene, camera, eventBus) {
    super(renderer, scene, camera, eventBus);
  }

  activate() {
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
  }

  deactivate() {
    this.renderer.toneMapping = THREE.NoToneMapping;
  }
}
