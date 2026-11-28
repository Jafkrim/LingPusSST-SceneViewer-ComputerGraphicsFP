import * as THREE from 'three';

function readSelectionOutlineStyle() {
  const styles = getComputedStyle(document.documentElement);
  const rawColor = styles.getPropertyValue('--selection-outline').trim();
  const rawWidth = parseFloat(styles.getPropertyValue('--selection-outline-width'));
  const color = new THREE.Color();
  if (rawColor) {
    color.setStyle(rawColor);
  } else {
    color.setHex(0xff9900);
  }
  return {
    color,
    width: Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 2.0,
  };
}

const OUTLINE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const OUTLINE_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tMask;
  uniform vec2 uTexelSize;
  uniform vec3 uOutlineColor;
  uniform float uThickness;
  varying vec2 vUv;

  void main() {
    float center = texture2D(tMask, vUv).r;
    if (center > 0.5) {
      discard;
    }

    vec2 stepUv = uTexelSize * uThickness;
    float maxNeighbor = 0.0;

    maxNeighbor = max(maxNeighbor, texture2D(tMask, vUv + vec2(-stepUv.x, 0.0)).r);
    maxNeighbor = max(maxNeighbor, texture2D(tMask, vUv + vec2( stepUv.x, 0.0)).r);
    maxNeighbor = max(maxNeighbor, texture2D(tMask, vUv + vec2(0.0, -stepUv.y)).r);
    maxNeighbor = max(maxNeighbor, texture2D(tMask, vUv + vec2(0.0,  stepUv.y)).r);

    vec2 diagUv = stepUv * 0.70710678;
    maxNeighbor = max(maxNeighbor, texture2D(tMask, vUv + vec2(-diagUv.x, -diagUv.y)).r);
    maxNeighbor = max(maxNeighbor, texture2D(tMask, vUv + vec2( diagUv.x, -diagUv.y)).r);
    maxNeighbor = max(maxNeighbor, texture2D(tMask, vUv + vec2(-diagUv.x,  diagUv.y)).r);
    maxNeighbor = max(maxNeighbor, texture2D(tMask, vUv + vec2( diagUv.x,  diagUv.y)).r);

    if (maxNeighbor <= 0.1) {
      discard;
    }

    gl_FragColor = vec4(uOutlineColor, smoothstep(0.1, 0.9, maxNeighbor));
  }
`;

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
    this.selectionTool = null;
    this._frameStats = { calls: 0, triangles: 0, lines: 0, points: 0 };

    const initialOutline = readSelectionOutlineStyle();
    this._maskTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this._maskClearColor = new THREE.Color(0x000000);

    this._outlineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tMask: { value: this._maskTarget.texture },
        uTexelSize: { value: new THREE.Vector2(1, 1) },
        uOutlineColor: { value: initialOutline.color },
        uThickness: { value: initialOutline.width },
      },
      vertexShader: OUTLINE_VERTEX_SHADER,
      fragmentShader: OUTLINE_FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this._outlineQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._outlineMaterial);
    this._outlineQuad.frustumCulled = false;
    this._outlineScene = new THREE.Scene();
    this._outlineScene.add(this._outlineQuad);
    this._outlineCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

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

    this.eventBus.on('input:action:down', ({ action } = {}) => {
      if (typeof action === 'string' && action.startsWith('view.mode.')) {
        const parsed = Number(action.slice('view.mode.'.length));
        if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 6) {
          this.eventBus.emit('view:setMode', { mode: parsed });
        }
      }
    });
    this.eventBus.on('theme:applied', () => {
      const nextOutline = readSelectionOutlineStyle();
      this._outlineMaterial.uniforms.uOutlineColor.value.copy(nextOutline.color);
      this._outlineMaterial.uniforms.uThickness.value = nextOutline.width;
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

    const rtW = Math.max(1, Math.round(width * pixelRatio));
    const rtH = Math.max(1, Math.round(height * pixelRatio));
    this._maskTarget.setSize(rtW, rtH);
    this._outlineMaterial.uniforms.uTexelSize.value.set(1 / rtW, 1 / rtH);

    this._activeStyle?.resize?.(width, height, pixelRatio);
  }

  _renderSelectionOutline() {
    if (!this.selectionTool?.hasSelection) return;

    const prevTarget = this.renderer.getRenderTarget();
    const prevAutoClear = this.renderer.autoClear;
    const prevClearColor = new THREE.Color();
    this.renderer.getClearColor(prevClearColor);
    const prevClearAlpha = this.renderer.getClearAlpha();

    this.renderer.setRenderTarget(this._maskTarget);
    this.renderer.setClearColor(this._maskClearColor, 0);
    this.renderer.clear(true, false, false);

    const rendered = this.selectionTool.renderSelectionMask(this.renderer, this.camera);

    this.renderer.setRenderTarget(prevTarget);
    this.renderer.setClearColor(prevClearColor, prevClearAlpha);

    if (rendered) {
      this.renderer.autoClear = false;
      this.renderer.render(this._outlineScene, this._outlineCamera);
    }
    this.renderer.autoClear = prevAutoClear;
  }

  update(dt, ctx) {
    this._activeStyle?.update?.(dt, ctx);
    this.eventBus.emit('render:beforeFrame', ctx);

    if (this._activeStyle) {
      this._activeStyle.render(this.renderer, this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // Capture main scene render stats BEFORE the selection silhouette mask & composite passes reset renderer.info
    const renderInfo = this.renderer.info.render;
    this._frameStats.calls = renderInfo.calls;
    this._frameStats.triangles = renderInfo.triangles;
    this._frameStats.lines = renderInfo.lines;
    this._frameStats.points = renderInfo.points;

    this._renderSelectionOutline();
    this.eventBus.emit('render:afterFrame', ctx);
  }

  getTelemetry() {
    const info = this.renderer.info;
    let calls = this._frameStats.calls;
    let triangles = this._frameStats.triangles;

    if (this.viewportGuides?.visible) {
      calls = Math.max(0, calls - 4);
      triangles = Math.max(0, triangles - 2);
    }

    return {
      calls,
      triangles,
      lines: this._frameStats.lines,
      points: this._frameStats.points,
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
    this._maskTarget?.dispose?.();
    this._outlineQuad?.geometry?.dispose?.();
    this._outlineMaterial?.dispose?.();
  }
}
