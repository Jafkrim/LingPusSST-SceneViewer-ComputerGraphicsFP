import * as THREE from 'three';
import { EVENTS } from '@/engine/eventBus.js';

const INFINITE_GRID_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const INFINITE_GRID_FRAGMENT = /* glsl */ `
  varying vec3 vWorldPos;

  uniform float uGridScale1;
  uniform float uGridScale2;
  uniform float uFadeDistance;
  uniform float uOpacity;
  uniform vec3 uColorMinor;
  uniform vec3 uColorMajor;
  uniform vec3 uColorAxisX;
  uniform vec3 uColorAxisZ;

  float gridFactor(vec2 coord, float scale) {
    vec2 scaled = coord / scale;
    vec2 derivative = fwidth(scaled);
    vec2 grid = abs(fract(scaled - 0.5) - 0.5) / max(derivative, vec2(1e-5));
    float line = min(grid.x, grid.y);
    return 1.0 - min(line, 1.0);
  }

  void main() {
    vec2 coord = vWorldPos.xz;

    float minor = gridFactor(coord, uGridScale1);
    float major = gridFactor(coord, uGridScale2);

    float dist = length(vWorldPos.xz - cameraPosition.xz);
    float fade = 1.0 - smoothstep(uFadeDistance * 0.35, uFadeDistance, dist);

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float grazing = smoothstep(0.02, 0.18, abs(viewDir.y));

    vec3 color = mix(uColorMinor, uColorMajor, major);
    float alpha = max(minor * 0.45, major * 0.85);

    vec2 axisDeriv = max(fwidth(coord), vec2(1e-5));
    float axisX = 1.0 - min(abs(coord.y) / (axisDeriv.y * 1.5), 1.0);
    float axisZ = 1.0 - min(abs(coord.x) / (axisDeriv.x * 1.5), 1.0);

    if (axisX > 0.01) {
      color = mix(color, uColorAxisX, axisX);
      alpha = max(alpha, axisX * 0.95);
    }
    if (axisZ > 0.01) {
      color = mix(color, uColorAxisZ, axisZ);
      alpha = max(alpha, axisZ * 0.95);
    }

    alpha *= fade * grazing * uOpacity;
    if (alpha < 0.005) discard;

    gl_FragColor = vec4(color, alpha);
  }
`;

export class ViewportGuides {
  constructor(scene, eventBus = null, options = {}) {
    this.scene = scene;
    this.eventBus = eventBus;

    this.group = new THREE.Group();
    this.group.name = 'ViewportGuides';
    this.group.userData.excludeFromSave = true;

    this.axesVisible = options.axesVisible ?? true;
    this.axisXColor = new THREE.Color(options.axisXColor ?? 0xd94848);
    this.axisZColor = new THREE.Color(options.axisZColor ?? 0x3b82f6);
    this.majorColor = new THREE.Color(options.majorColor ?? 0x7a7a7a);

    const fadeDistance = options.fadeDistance ?? 140;
    const planeSize = fadeDistance * 2.5;

    const geometry = new THREE.PlaneGeometry(planeSize, planeSize, 1, 1);
    geometry.rotateX(-Math.PI / 2);

    this.gridMaterial = new THREE.ShaderMaterial({
      vertexShader: INFINITE_GRID_VERTEX,
      fragmentShader: INFINITE_GRID_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uGridScale1: { value: options.minorStep ?? 1.0 },
        uGridScale2: { value: options.majorStep ?? 10.0 },
        uFadeDistance: { value: fadeDistance },
        uOpacity: { value: options.opacity ?? 1.0 },
        uColorMinor: { value: new THREE.Color(options.minorColor ?? 0x525252) },
        uColorMajor: { value: this.majorColor.clone() },
        uColorAxisX: { value: this.axisXColor.clone() },
        uColorAxisZ: { value: this.axisZColor.clone() },
      },
    });

    this.grid = new THREE.Mesh(geometry, this.gridMaterial);
    this.grid.position.y = 0.001;
    this.grid.frustumCulled = false;
    this.grid.renderOrder = -1;

    // Follow whichever camera Three.js is currently rendering without cross-system dependencies
    this.grid.onBeforeRender = (_renderer, _scene, camera) => {
      if (!camera?.position) return;
      this.grid.position.x = camera.position.x;
      this.grid.position.z = camera.position.z;
    };

    this.group.add(this.grid);

    // Unlimited vertical Y-axis line along X = 0, Z = 0
    const ySpan = options.yAxisSpan ?? 10000;
    const yAxisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -ySpan, 0),
      new THREE.Vector3(0, ySpan, 0),
    ]);
    this.yAxisMat = new THREE.LineBasicMaterial({
      color: options.axisYColor ?? 0x22c55e,
      transparent: true,
      opacity: (options.opacity ?? 1.0) * 0.85,
    });
    this.yAxisLine = new THREE.Line(yAxisGeo, this.yAxisMat);
    this.yAxisLine.frustumCulled = false;
    this.yAxisLine.visible = this.axesVisible;
    this.group.add(this.yAxisLine);

    this.scene.add(this.group);
    this._unsubscribers = this._bindEvents();
  }

  update(_dt) {
    // Intentionally empty: Engine._loop passes dt (number), while camera tracking runs in onBeforeRender
  }

  setStyle({ minorColor, majorColor, axisXColor, axisYColor, axisZColor, opacity } = {}) {
    if (minorColor !== undefined) {
      this.gridMaterial.uniforms.uColorMinor.value.set(minorColor);
    }
    if (majorColor !== undefined) {
      this.majorColor.set(majorColor);
      this.gridMaterial.uniforms.uColorMajor.value.copy(this.majorColor);
      if (!this.axesVisible) {
        this.gridMaterial.uniforms.uColorAxisX.value.copy(this.majorColor);
        this.gridMaterial.uniforms.uColorAxisZ.value.copy(this.majorColor);
      }
    }
    if (axisXColor !== undefined) {
      this.axisXColor.set(axisXColor);
      if (this.axesVisible) this.gridMaterial.uniforms.uColorAxisX.value.copy(this.axisXColor);
    }
    if (axisZColor !== undefined) {
      this.axisZColor.set(axisZColor);
      if (this.axesVisible) this.gridMaterial.uniforms.uColorAxisZ.value.copy(this.axisZColor);
    }
    if (axisYColor !== undefined) {
      this.yAxisMat.color.set(axisYColor);
    }
    if (typeof opacity === 'number') {
      const clamped = Math.max(0, Math.min(1, opacity));
      this.gridMaterial.uniforms.uOpacity.value = clamped;
      this.yAxisMat.opacity = clamped * 0.85;
    }
  }

  setGridVisible(visible) {
    this.grid.visible = Boolean(visible);
  }

  setAxesVisible(visible) {
    this.axesVisible = Boolean(visible);
    this.yAxisLine.visible = this.axesVisible;
    this.gridMaterial.uniforms.uColorAxisX.value.copy(
      this.axesVisible ? this.axisXColor : this.majorColor
    );
    this.gridMaterial.uniforms.uColorAxisZ.value.copy(
      this.axesVisible ? this.axisZColor : this.majorColor
    );
  }

  _bindEvents() {
    if (!this.eventBus) return [];

    return [
      this.eventBus.on('viewport:toggleGrid', ({ visible }) => this.setGridVisible(visible)),
      this.eventBus.on('viewport:toggleAxes', ({ visible }) => this.setAxesVisible(visible)),
      this.eventBus.on('viewport:setGridStyle', (style) => this.setStyle(style)),
      this.eventBus.on(EVENTS.THEME_CHANGED, (theme) => {
        const tokens = theme?.tokens;
        if (!tokens) return;

        const opacity = parseFloat(tokens['--viewport-grid-opacity']);
        this.setStyle({
          minorColor: tokens['--viewport-grid-minor'] ?? '#525252',
          majorColor: tokens['--viewport-grid-major'] ?? '#7a7a7a',
          axisXColor: tokens['--viewport-axis-x'] ?? '#d94848',
          axisYColor: tokens['--viewport-axis-y'] ?? '#22c55e',
          axisZColor: tokens['--viewport-axis-z'] ?? '#3b82f6',
          opacity: Number.isFinite(opacity) ? opacity : 1.0,
        });
      }),
    ];
  }

  dispose() {
    this._unsubscribers?.forEach((unsub) => unsub?.());
    this.grid.onBeforeRender = null;
    this.grid.geometry?.dispose();
    this.gridMaterial?.dispose();
    this.yAxisLine.geometry?.dispose();
    this.yAxisMat?.dispose();
    this.scene.remove(this.group);
  }
}
