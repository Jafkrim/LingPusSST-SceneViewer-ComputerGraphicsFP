import defaultUiSettings from '@/config/uiSettings.json';
import defaultCameraSettings from '@/config/cameraSettings.json';
import defaultKeybinds from '@/config/keybinds.json';

const STORAGE_PREFIX = 'lingpus_sst_config_v1:';
const DEFAULT_CONFIGS = {
  'uiSettings.json': defaultUiSettings,
  'cameraSettings.json': defaultCameraSettings,
  'keybinds.json': defaultKeybinds,
};

function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return override !== undefined ? override : base;
  }
  const out = { ...(base && typeof base === 'object' ? base : {}) };
  for (const [k, v] of Object.entries(override)) {
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      out[k] &&
      typeof out[k] === 'object' &&
      !Array.isArray(out[k])
    ) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

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
    this._dirHandle = null;
    this._configs = {};

    this._resizeObserver = new ResizeObserver(() => this._syncSize(true));
    this._resizeObserver.observe(this.canvas);

    this.eventBus.on('ui:viewportLayoutChanged', () => {
      this._syncSize(true);
    });

    this.eventBus.on('ui:scaleChanged', () => {
      this._syncSize(true);
    });

    this._initConfigPersistence();

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

  _initConfigPersistence() {
    for (const [fileName, defaults] of Object.entries(DEFAULT_CONFIGS)) {
      this._configs[fileName] = this._readStorageSync(fileName, structuredClone(defaults));
    }

    this.eventBus.on('config:save', ({ fileName, data, merge = true } = {}) => {
      if (!fileName || !data) return;
      const base = this._configs[fileName] ?? DEFAULT_CONFIGS[fileName] ?? {};
      const next = merge ? deepMerge(base, data) : data;
      this.saveConfigFile(fileName, next);
    });

    this.eventBus.on('config:reset', ({ fileName } = {}) => {
      if (fileName) this.resetConfigFile(fileName);
    });

    this.eventBus.on('config:linkDirectory', () => {
      this.linkLocalConfigDir();
    });

    this.eventBus.on('settings:cameraChanged', (patch = {}) => {
      const next = deepMerge(this._configs['cameraSettings.json'], patch);
      this.saveConfigFile('cameraSettings.json', next);
    });

    this.eventBus.on('settings:keybindsChanged', ({ keybinds } = {}) => {
      if (keybinds) this.saveConfigFile('keybinds.json', keybinds);
    });

    this.eventBus.on('settings:graphicsChanged', (patch = {}) => {
      const next = deepMerge(this._configs['graphicsSettings.json'] ?? {}, patch);
      this.saveConfigFile('graphicsSettings.json', next);
    });

    this.eventBus.on('settings:postProcessChanged', (patch = {}) => {
      const next = deepMerge(this._configs['postProcessSettings.json'] ?? {}, patch);
      this.saveConfigFile('postProcessSettings.json', next);
    });

    this._hydrateConfigsFromDisk();
  }

  _sanitizeUiSessionState(data) {
    if (!data || typeof data !== 'object') return data;
    const clean = structuredClone(data);
    clean.panels = structuredClone(defaultUiSettings.panels);
    clean.hudHidden = Boolean(defaultUiSettings.hudHidden);
    if (clean.editorPanel && typeof clean.editorPanel === 'object') {
      clean.editorPanel.activeTab = defaultUiSettings.editorPanel.activeTab;
    }
    return clean;
  }

  _readStorageSync(fileName, fallback) {
    if (import.meta.env.DEV) {
      return fileName === 'uiSettings.json' ? this._sanitizeUiSessionState(fallback) : fallback;
    }
    try {
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${fileName}`);
      const merged = raw ? deepMerge(fallback, JSON.parse(raw)) : fallback;
      return fileName === 'uiSettings.json' ? this._sanitizeUiSessionState(merged) : merged;
    } catch {
      return fallback;
    }
  }

  getConfig(fileName) {
    return this._configs[fileName] ?? structuredClone(DEFAULT_CONFIGS[fileName] ?? {});
  }

  async loadConfigFile(fileName, fallback = DEFAULT_CONFIGS[fileName] ?? {}) {
    if (import.meta.env.DEV) {
      try {
        const res = await fetch(`/__config/${encodeURIComponent(fileName)}`, { cache: 'no-store' });
        if (res.ok) {
          let merged = deepMerge(fallback, await res.json());
          if (fileName === 'uiSettings.json') merged = this._sanitizeUiSessionState(merged);
          this._configs[fileName] = merged;
          return merged;
        }
      } catch {}
    }

    if (this._dirHandle) {
      try {
        const fh = await this._dirHandle.getFileHandle(fileName);
        const file = await fh.getFile();
        let merged = deepMerge(fallback, JSON.parse(await file.text()));
        if (fileName === 'uiSettings.json') merged = this._sanitizeUiSessionState(merged);
        this._configs[fileName] = merged;
        return merged;
      } catch {}
    }

    const stored = this._readStorageSync(fileName, fallback);
    this._configs[fileName] = stored;
    return stored;
  }

  async saveConfigFile(fileName, data) {
    this._configs[fileName] = data;
    const toPersist =
      fileName === 'uiSettings.json' ? this._sanitizeUiSessionState(data) : data;
    const serialized = `${JSON.stringify(toPersist, null, 2)}\n`;

    if (import.meta.env.DEV) {
      try {
        await fetch(`/__config/${encodeURIComponent(fileName)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: serialized,
        });
      } catch {}
    }

    if (this._dirHandle) {
      try {
        const fh = await this._dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fh.createWritable();
        await writable.write(serialized);
        await writable.close();
      } catch {}
    }

    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${fileName}`, serialized);
    } catch {}
  }

  async resetConfigFile(fileName) {
    const defaults = structuredClone(DEFAULT_CONFIGS[fileName] ?? {});
    await this.saveConfigFile(fileName, defaults);
    this.eventBus.emit('config:loaded', { fileName, data: defaults });
  }

  async linkLocalConfigDir() {
    if (!window.showDirectoryPicker) return false;
    try {
      this._dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      for (const [fileName, data] of Object.entries(this._configs)) {
        await this.saveConfigFile(fileName, data);
      }
      return true;
    } catch {
      return false;
    }
  }

  async _hydrateConfigsFromDisk() {
    for (const [fileName, defaults] of Object.entries(DEFAULT_CONFIGS)) {
      const data = await this.loadConfigFile(fileName, structuredClone(defaults));
      this.eventBus.emit('config:loaded', { fileName, data });
    }
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
