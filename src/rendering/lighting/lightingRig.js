import * as THREE from 'three';

export class LightingRig {
  constructor(scene, eventBus = null) {
    this.scene = scene;
    this.eventBus = eventBus;

    this.group = new THREE.Group();
    this.group.name = 'LightingRig';
    this.group.userData.excludeFromSave = true;

    this.hemiLight = new THREE.HemisphereLight(0xddeeff, 0x3b3b3b, 1.1);
    this.hemiLight.position.set(0, 20, 0);
    this.group.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5e4, 2.2);
    this.sunLight.position.set(8, 14, 10);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 60;
    const d = 14;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.group.add(this.sunLight);
    this.group.add(this.sunLight.target);

    this.scene.add(this.group);

    this._bindEvents();
  }

  _bindEvents() {
    this.eventBus?.on('timeOfDay:updated', ({ sunDirection, sunColor, sunIntensity, ambientIntensity }) => {
      if (sunDirection) {
        this.sunLight.position.copy(sunDirection).multiplyScalar(20);
      }
      if (sunColor) this.sunLight.color.set(sunColor);
      if (typeof sunIntensity === 'number') this.sunLight.intensity = sunIntensity;
      if (typeof ambientIntensity === 'number') this.hemiLight.intensity = ambientIntensity;
    });
  }

  dispose() {
    this.sunLight.shadow.map?.dispose();
    this.scene.remove(this.group);
  }
}
