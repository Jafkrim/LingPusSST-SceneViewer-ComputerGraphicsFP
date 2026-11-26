export class Engine {
  constructor({ canvas, eventBus, config = {} }) {
    if (!canvas) throw new Error('Engine requires a valid canvas element.');
    if (!eventBus) throw new Error('Engine requires an EventBus instance.');

    this.canvas = canvas;
    this.eventBus = eventBus;

    this.maxDelta = config.maxDelta ?? 0.05;
    this.pixelRatioCap = config.pixelRatioCap ?? 2;

    this.width = Math.max(1, canvas.clientWidth || window.innerWidth);
    this.height = Math.max(1, canvas.clientHeight || window.innerHeight);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.pixelRatioCap);

    this.elapsed = 0;
    this.delta = 0;
    this.frameCount = 0;
    this.running = false;

    this._rafId = null;
    this._lastTime = 0;
    this._subsystems = new Map();
    this._ordered = [];

    this._resizeObserver = new ResizeObserver(() => this._syncSize(true));
    this._resizeObserver.observe(this.canvas);

    this.eventBus.on('settings:graphicsChanged', (settings = {}) => {
      if (typeof settings.pixelRatioCap === 'number' && settings.pixelRatioCap > 0) {
        this.pixelRatioCap = settings.pixelRatioCap;
        this._syncSize(true);
      }
      if (typeof settings.maxDelta === 'number' && settings.maxDelta > 0) {
        this.maxDelta = settings.maxDelta;
      }
    });
  }

  register(name, instance, priority = 50) {
    if (this._subsystems.has(name)) {
      throw new Error(`Subsystem "${name}" is already registered.`);
    }
    this._subsystems.set(name, { name, instance, priority });
    this._ordered = [...this._subsystems.values()].sort((a, b) => a.priority - b.priority);
    return instance;
  }

  get(name) {
    return this._subsystems.get(name)?.instance ?? null;
  }

  _syncSize(force = false) {
    const nextWidth = Math.max(1, Math.floor(this.canvas.clientWidth));
    const nextHeight = Math.max(1, Math.floor(this.canvas.clientHeight));
    const nextDpr = Math.min(window.devicePixelRatio || 1, this.pixelRatioCap);

    if (
      !force &&
      nextWidth === this.width &&
      nextHeight === this.height &&
      nextDpr === this.pixelRatio
    ) {
      return;
    }

    this.width = nextWidth;
    this.height = nextHeight;
    this.pixelRatio = nextDpr;

    for (const { instance } of this._ordered) {
      instance.resize?.(this.width, this.height, this.pixelRatio);
    }

    this.eventBus.emit('engine:resize', {
      width: this.width,
      height: this.height,
      pixelRatio: this.pixelRatio,
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = performance.now();
    this._syncSize(true);

    const tick = (now) => {
      if (!this.running) return;
      this._rafId = requestAnimationFrame(tick);

      const rawDt = (now - this._lastTime) / 1000;
      this._lastTime = now;
      this.delta = Math.min(Math.max(rawDt, 0), this.maxDelta);
      this.elapsed += this.delta;
      this.frameCount += 1;

      const ctx = {
        dt: this.delta,
        elapsed: this.elapsed,
        frame: this.frameCount,
        width: this.width,
        height: this.height,
        pixelRatio: this.pixelRatio,
      };

      for (const { instance } of this._ordered) {
        instance.update?.(this.delta, ctx);
      }

      this.eventBus.emit('engine:tick', ctx);

      this.get('inputManager')?.flushFrame?.();
    };

    this._rafId = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  dispose() {
    this.stop();
    this._resizeObserver.disconnect();

    for (const { instance } of [...this._ordered].reverse()) {
      instance.dispose?.();
    }

    this._subsystems.clear();
    this._ordered = [];
    this.eventBus.clear();
  }
}
