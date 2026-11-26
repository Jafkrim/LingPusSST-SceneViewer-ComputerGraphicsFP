import * as THREE from 'three';
import { EVENTS } from '@/engine/eventBus.js';

export class SceneManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.scene = new THREE.Scene();
    this.entities = new Map();

    const initialBg =
      getComputedStyle(document.documentElement).getPropertyValue('--bg-viewport').trim() || '#1d1d1d';
    this._fallbackBg = new THREE.Color(initialBg);
    this.scene.background = this._fallbackBg;

    this.eventBus.on(EVENTS.THEME_CHANGED, (theme) => {
      const bg = theme?.tokens?.['--bg-viewport'];
      if (!bg) return;

      this._fallbackBg.set(bg);

      // Only apply theme color when no HDR/skybox texture is active
      if (this.scene.background instanceof THREE.Color) {
        this.scene.background = this._fallbackBg;
      }
    });
  }

  setSkybox(texture) {
    if (texture) {
      this.scene.background = texture;
    } else {
      this.scene.background = this._fallbackBg;
    }
  }

  addObject(id, object3D) {
    this.entities.set(id, object3D);
    this.scene.add(object3D);
    this.eventBus.emit(EVENTS.ASSET_SPAWNED, { id, object: object3D });
    return object3D;
  }

  removeObject(id) {
    const obj = this.entities.get(id);
    if (!obj) return false;
    this.scene.remove(obj);
    this.entities.delete(id);
    return true;
  }

  clear() {
    for (const obj of this.entities.values()) {
      this.scene.remove(obj);
    }
    this.entities.clear();
    this.eventBus.emit(EVENTS.SCENE_CLEARED);
  }

  update(dt) {}
}
