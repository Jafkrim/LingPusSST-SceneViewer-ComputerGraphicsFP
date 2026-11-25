import { EventBus, EVENTS } from './eventBus.js';

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.eventBus = new EventBus();
    this.systems = new Map();

    this._running = false;
    this._rafId = null;
    this._lastTime = 0;

    this.width = canvas.clientWidth || window.innerWidth;
    this.height = canvas.clientHeight || window.innerHeight;

    this._resizeObserver = new ResizeObserver(() => this._handleResize());
    this._resizeObserver.observe(this.canvas);
  }

  register(name, system) {
    this.systems.set(name, system);
    if (typeof system.init === 'function') {
      system.init(this);
    }
    return system;
  }

  get(name) {
    return this.systems.get(name);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    this._loop(this._lastTime);
  }

  stop() {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _handleResize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (w === 0 || h === 0) return;

    this.width = w;
    this.height = h;

    for (const system of this.systems.values()) {
      if (typeof system.resize === 'function') {
        system.resize(w, h);
      }
    }

    this.eventBus.emit(EVENTS.ENGINE_RESIZE, { width: w, height: h });
  }

  _loop(now) {
    if (!this._running) return;
    this._rafId = requestAnimationFrame((t) => this._loop(t));

    const dt = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;

    for (const system of this.systems.values()) {
      if (typeof system.update === 'function') {
        system.update(dt);
      }
    }

    const pipeline = this.get('renderPipeline');
    if (pipeline) {
      pipeline.render(dt);
    }
  }
}
