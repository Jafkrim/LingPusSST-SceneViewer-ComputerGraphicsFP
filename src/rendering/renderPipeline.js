import * as THREE from 'three';

const SHADOW_TYPE_MAP = {
  basic: THREE.BasicShadowMap,
  pcf: THREE.PCFShadowMap,
  pcfSoft: THREE.PCFShadowMap,
  vsm: THREE.VSMShadowMap,
};

export class RenderPipeline {
  constructor({ canvas, scene, camera, eventBus, viewportGuides = null, config = {} }) {
    if (!canvas || !scene || !camera || !eventBus) {
      throw new Error('RenderPipeline requires canvas, scene, camera, and eventBus.');
    }

    this.canvas = canvas;
    this.scene = scene;
    this.camera = camera;
    this.eventBus = eventBus;
    this.viewportGuides = viewportGuides;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: config.antialias ?? true,
      powerPreference: config.powerPreference ?? 'high-performance',
      stencil: false,
    });

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = config.shadowsEnabled ?? true;
    this.renderer.shadowMap.type =
      SHADOW_TYPE_MAP[config.shadowType ?? 'pcfSoft'] ?? THREE.PCFShadowMap;

    this.composer = null;
    this._styles = new Map();
    this._activeStyle = null;

    this._bindEvents();
  }

  _bindEvents() {
    this.eventBus.on('settings:graphicsChanged', (settings = {}) => {
      if (typeof settings.shadowsEnabled === 'boolean') {
        this.renderer.shadowMap.enabled = settings.shadowsEnabled;
        this.renderer.shadowMap.needsUpdate = true;
      }
      if (settings.shadowType && settings.shadowType in SHADOW_TYPE_MAP) {
        this.renderer.shadowMap.type = SHADOW_TYPE_MAP[settings.shadowType];
        this.renderer.shadowMap.needsUpdate = true;
      }
    });

    this.eventBus.on('render:setStyle', ({ id } = {}) => {
      if (id) this.setStyle(id);
    });
  }

  registerStyle(id, styleInstance) {
    this._styles.set(id, styleInstance);
    return styleInstance;
  }

  get activeStyle() {
    return this._activeStyle;
  }

  setStyle(id) {
    const next = this._styles.get(id);
    if (!next) {
      throw new Error(`Render style "${id}" is not registered.`);
    }
    if (this._activeStyle === next) return;

    this._activeStyle?.deactivate();
    this._activeStyle = next;
    this._activeStyle.activate();

    this.eventBus.emit('render:styleChanged', { id, label: next.label });
  }

  resize(width, height, pixelRatio = 1) {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.composer?.setSize?.(width, height);
    this._activeStyle?.resize?.(width, height, pixelRatio);
  }

  update(dt, ctx) {
    this._activeStyle?.update?.(dt, ctx);
    this.eventBus.emit('render:beforeFrame', ctx);
    if (this._activeStyle) {
      this._activeStyle.render(this.renderer, this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.eventBus.emit('render:afterFrame', ctx);
  }

  getTelemetry() {
    const info = this.renderer.info;
    let calls = info.render.calls;
    let triangles = info.render.triangles;

    if (this.viewportGuides?.visible) {
      calls = Math.max(0, calls - 4);
      triangles = Math.max(0, triangles - 2);
    }

    return {
      calls,
      triangles,
      lines: info.render.lines,
      points: info.render.points,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  dispose() {
    for (const style of this._styles.values()) {
      style.dispose?.();
    }
    this._styles.clear();
    this._activeStyle = null;
    this.composer?.dispose?.();
    this.renderer.dispose();
  }
}
