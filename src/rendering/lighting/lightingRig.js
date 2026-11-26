import * as THREE from 'three';

export class LightingRig {
  constructor({ scene, eventBus, config = {} }) {
    if (!scene || !eventBus) {
      throw new Error('LightingRig requires scene and eventBus.');
    }

    this.scene = scene;
    this.eventBus = eventBus;

    this.group = new THREE.Group();
    this.group.name = 'LightingRig';

    this.hemiLight = new THREE.HemisphereLight(
      config.skyColor ?? 0xdbeafe,
      config.groundColor ?? 0x334155,
      config.hemiIntensity ?? 1.0
    );
    this.group.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(
      config.sunColor ?? 0xffffff,
      config.sunIntensity ?? 2.4
    );
    const sunPos = config.sunPosition ?? [12, 18, 12];
    this.dirLight.position.set(sunPos[0], sunPos[1], sunPos[2]);
    this.dirLight.castShadow = config.castShadow ?? true;
    this.dirLight.shadow.mapSize.set(
      config.shadowMapSize ?? 1024,
      config.shadowMapSize ?? 1024
    );
    this.group.add(this.dirLight);

    this.scene.add(this.group);

    this._unsub = this.eventBus.on('settings:lightingChanged', (patch = {}) => {
      if (typeof patch.sunIntensity === 'number') this.dirLight.intensity = patch.sunIntensity;
      if (typeof patch.hemiIntensity === 'number') this.hemiLight.intensity = patch.hemiIntensity;
      if (typeof patch.castShadow === 'boolean') this.dirLight.castShadow = patch.castShadow;
    });
  }

  dispose() {
    this._unsub?.();
    this.scene.remove(this.group);
    this.dirLight.shadow.map?.dispose?.();
  }
}
