import * as THREE from 'three';
import { EVENTS } from '@/engine/eventBus.js';

export class SceneManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.scene = new THREE.Scene();
    this.entities = new Map();

    const initialBg =
      getComputedStyle(document.documentElement).getPropertyValue('--bg-viewport').trim() || '#1d1d1d';
    this.scene.background = new THREE.Color(initialBg);

    this.eventBus.on(EVENTS.THEME_CHANGED, (theme) => {
      const bg = theme?.tokens?.['--bg-viewport'];
      if (bg) {
        this.scene.background.set(bg);
      }
    });
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
