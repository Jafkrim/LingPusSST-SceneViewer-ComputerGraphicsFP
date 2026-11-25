import * as THREE from 'three';
import { EVENTS } from '@/engine/eventBus.js';

export class PawnManager {
  constructor(canvas, eventBus, aspect = 16 / 9) {
    this.canvas = canvas;
    this.eventBus = eventBus;

    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 2000);
    this.camera.position.set(5, 4, 5);
    this.camera.lookAt(0, 0, 0);

    this.controllers = new Map();
    this.activeController = null;
  }

  registerController(name, controller) {
    this.controllers.set(name, controller);
  }

  setController(name) {
    const next = this.controllers.get(name);
    if (!next || next === this.activeController) return;

    this.activeController?.deactivate();
    this.activeController = next;
    this.activeController.activate();

    this.eventBus.emit(EVENTS.PAWN_CHANGED, { mode: name });
  }

  resize(width, height) {
    if (height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.activeController?.update(dt);
  }
}
