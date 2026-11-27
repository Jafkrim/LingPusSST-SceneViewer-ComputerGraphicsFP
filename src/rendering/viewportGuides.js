import * as THREE from 'three';
import defaultUiSettings from '@/config/uiSettings.json';

function readThemeColor(styles, token, fallback) {
  const raw = styles.getPropertyValue(token).trim();
  return raw || fallback;
}

function readThemeNumber(styles, token, fallback) {
  const parsed = parseFloat(styles.getPropertyValue(token).trim());
  return Number.isNaN(parsed) ? fallback : parsed;
}

export class ViewportGuides {
  constructor({ scene, eventBus, config = {} }) {
    if (!scene || !eventBus) {
      throw new Error('ViewportGuides requires scene and eventBus.');
    }

    this.scene = scene;
    this.eventBus = eventBus;
    this.visible = config.visible ?? true;

    this._guideFlags = {
      ...defaultUiSettings.viewportGuides,
      ...(config.viewportGuides ?? {}),
    };

    this.group = new THREE.Group();
    this.group.name = 'ViewportGuides';
    this._applyVisibility();

    this._minorSpacing = config.minorSpacing ?? 1.0;
    this._majorEvery = config.majorEvery ?? 10;
    this._axisThickness = config.axisThickness ?? 0.025;
    this._fadeStart = config.fadeStart ?? 80;
    this._fadeEnd = config.fadeEnd ?? 350;
    this._axisExtent = config.axisExtent ?? 2000;

    const styles = getComputedStyle(document.documentElement);
    const initialMinor = config.minorColor ?? readThemeColor(styles, '--viewport-grid-minor', '#525252');
    const initialMajor = config.majorColor ?? readThemeColor(styles, '--viewport-grid-major', '#7a7a7a');
    const initialAxisX = config.axisXColor ?? readThemeColor(styles, '--viewport-axis-x', '#ff0000');
    const initialAxisY = config.axisYColor ?? readThemeColor(styles, '--viewport-axis-y', '#00ff00');
    const initialAxisZ = config.axisZColor ?? readThemeColor(styles, '--viewport-axis-z', '#0000ff');
    const initialOpacity = THREE.MathUtils.clamp(
      config.opacity ?? readThemeNumber(styles, '--viewport-grid-opacity', 0.8),
      0,
      1
    );

    this._gridUniforms = {
      uCameraPos: { value: new THREE.Vector3() },
      uMinorColor: { value: new THREE.Color(initialMinor) },
      uMajorColor: { value: new THREE.Color(initialMajor) },
      uAxisXColor: { value: new THREE.Color(initialAxisX) },
      uAxisYColor: { value: new THREE.Color(initialAxisY) },
      uAxisZColor: { value: new THREE.Color(initialAxisZ) },
      uOpacity: { value: initialOpacity },
      uMinorScale: { value: 1 / this._minorSpacing },
      uMajorScale: { value: 1 / (this._minorSpacing * this._majorEvery) },
      uAxisWidth: { value: this._axisThickness },
      uFadeStart: { value: this._fadeStart },
      uFadeEnd: { value: this._fadeEnd },
    };

    this.gridMesh = this._createInfiniteGridPlane();
    this.axesGroup = this._createInfiniteAxes({
      x: initialAxisX,
      y: initialAxisY,
      z: initialAxisZ,
      opacity: initialOpacity,
    });

    this.group.add(this.gridMesh, this.axesGroup);
    this.scene.add(this.group);

    this._applyGuideFlags();

    this._unsubs = [
      this.eventBus.on('theme:applied', () => this.syncThemeTokens()),
      this.eventBus.on('viewport:guidesChanged', (patch = {}) => {
        this._guideFlags = {
          ...this._guideFlags,
          ...patch,
        };
        this._applyGuideFlags();
      }),
      this.eventBus.on('config:loaded', ({ fileName, data } = {}) => {
        if (fileName === 'uiSettings.json' && data?.viewportGuides) {
          this._guideFlags = {
            ...this._guideFlags,
            ...data.viewportGuides,
          };
          this._applyGuideFlags();
        }
      }),
      this.eventBus.on('guides:setVisible', ({ visible } = {}) => {
        if (typeof visible === 'boolean') {
          this.visible = visible;
          this._applyVisibility();
        }
      }),
      this.eventBus.on('settings:guidesChanged', (patch = {}) => {
        if (typeof patch.minorSpacing === 'number' && patch.minorSpacing > 0) {
          this._minorSpacing = patch.minorSpacing;
          this._gridUniforms.uMinorScale.value = 1 / this._minorSpacing;
          this._gridUniforms.uMajorScale.value = 1 / (this._minorSpacing * this._majorEvery);
        }
        if (typeof patch.majorEvery === 'number' && patch.majorEvery > 0) {
          this._majorEvery = patch.majorEvery;
          this._gridUniforms.uMajorScale.value = 1 / (this._minorSpacing * this._majorEvery);
        }
        if (typeof patch.fadeStart === 'number') {
          this._fadeStart = patch.fadeStart;
          this._gridUniforms.uFadeStart.value = patch.fadeStart;
          for (const mat of Object.values(this._axisMaterials)) {
            mat.uniforms.uFadeStart.value = patch.fadeStart;
          }
        }
        if (typeof patch.fadeEnd === 'number') {
          this._fadeEnd = patch.fadeEnd;
          this._gridUniforms.uFadeEnd.value = patch.fadeEnd;
          for (const mat of Object.values(this._axisMaterials)) {
            mat.uniforms.uFadeEnd.value = patch.fadeEnd;
          }
        }
      }),
    ];

    this.syncThemeTokens();
  }

  _applyVisibility() {
    this.group.visible = this.visible;
  }

  _applyGuideFlags() {
    if (this.gridMesh) this.gridMesh.visible = Boolean(this._guideFlags.grid);
    if (this.axisXLine) this.axisXLine.visible = Boolean(this._guideFlags.axisX);
    if (this.axisYLine) this.axisYLine.visible = Boolean(this._guideFlags.axisY);
    if (this.axisZLine) this.axisZLine.visible = Boolean(this._guideFlags.axisZ);
  }

  _createInfiniteGridPlane() {
    const planeSize = Math.max(1000, this._fadeEnd * 4);
    const geometry = new THREE.PlaneGeometry(planeSize, planeSize, 1, 1);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.ShaderMaterial({
      uniforms: this._gridUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vWorldPos;

        uniform vec3 uCameraPos;
        uniform vec3 uMinorColor;
        uniform vec3 uMajorColor;
        uniform float uOpacity;
        uniform float uMinorScale;
        uniform float uMajorScale;
        uniform float uFadeStart;
        uniform float uFadeEnd;

        float gridLineFactor(vec2 coord, float scale) {
          vec2 p = coord * scale;
          vec2 fw = fwidth(p);
          vec2 grid = abs(fract(p - 0.5) - 0.5) / max(fw, vec2(1e-5));
          float line = min(grid.x, grid.y);
          return 1.0 - min(line, 1.0);
        }

        void main() {
          vec2 xz = vWorldPos.xz;
          float dist = length(xz - uCameraPos.xz);
          float distFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
          if (distFade <= 0.001) discard;

          float minor = gridLineFactor(xz, uMinorScale);
          float major = gridLineFactor(xz, uMajorScale);

          vec3 col = mix(uMinorColor, uMajorColor, major);
          float alpha = max(minor * 0.45, major * 0.85);

          float finalAlpha = alpha * distFade * uOpacity;
          if (finalAlpha <= 0.002) discard;

          gl_FragColor = vec4(col, finalAlpha);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'InfiniteFloorGrid';
    mesh.renderOrder = -1;
    mesh.frustumCulled = false;
    return mesh;
  }

  _createAxisLine(points, colorValue, opacity, name) {
    const curve = new THREE.LineCurve3(points[0], points[1]);
    const sampled = curve.getPoints(128);
    const geo = new THREE.BufferGeometry().setFromPoints(sampled);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(colorValue) },
        uCameraPos: this._gridUniforms.uCameraPos,
        uOpacity: { value: opacity },
        uFadeStart: { value: this._fadeStart },
        uFadeEnd: { value: this._fadeEnd },
      },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vWorldPos;

        uniform vec3 uColor;
        uniform vec3 uCameraPos;
        uniform float uOpacity;
        uniform float uFadeStart;
        uniform float uFadeEnd;

        void main() {
          float dist = distance(vWorldPos, uCameraPos);
          float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
          float alpha = fade * uOpacity;
          if (alpha <= 0.002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });

    const line = new THREE.Line(geo, mat);
    line.name = name;
    line.frustumCulled = false;
    return { line, geo, mat };
  }

  _createInfiniteAxes({ x, y, z, opacity }) {
    const group = new THREE.Group();
    group.name = 'InfiniteWorldAxes';
    const ext = this._axisExtent;

    const xAxis = this._createAxisLine(
      [new THREE.Vector3(-ext, 0, 0), new THREE.Vector3(ext, 0, 0)],
      x,
      opacity,
      'WorldAxisX'
    );
    const yAxis = this._createAxisLine(
      [new THREE.Vector3(0, -ext, 0), new THREE.Vector3(0, ext, 0)],
      y,
      opacity,
      'WorldAxisY'
    );
    const zAxis = this._createAxisLine(
      [new THREE.Vector3(0, 0, -ext), new THREE.Vector3(0, 0, ext)],
      z,
      opacity,
      'WorldAxisZ'
    );

    this.axisXLine = xAxis.line;
    this.axisYLine = yAxis.line;
    this.axisZLine = zAxis.line;

    this._axisMaterials = { x: xAxis.mat, y: yAxis.mat, z: zAxis.mat };
    this._axisGeometries = [xAxis.geo, yAxis.geo, zAxis.geo];

    group.add(xAxis.line, yAxis.line, zAxis.line);
    return group;
  }

  syncThemeTokens() {
    const styles = getComputedStyle(document.documentElement);
    const minor = styles.getPropertyValue('--viewport-grid-minor').trim();
    const major = styles.getPropertyValue('--viewport-grid-major').trim();
    const opacity = readThemeNumber(styles, '--viewport-grid-opacity', NaN);
    const axX = styles.getPropertyValue('--viewport-axis-x').trim();
    const axY = styles.getPropertyValue('--viewport-axis-y').trim();
    const axZ = styles.getPropertyValue('--viewport-axis-z').trim();

    if (minor) this._gridUniforms.uMinorColor.value.setStyle(minor);
    if (major) this._gridUniforms.uMajorColor.value.setStyle(major);
    if (!Number.isNaN(opacity)) {
      const clamped = THREE.MathUtils.clamp(opacity, 0, 1);
      this._gridUniforms.uOpacity.value = clamped;
      this._axisMaterials.x.uniforms.uOpacity.value = clamped;
      this._axisMaterials.y.uniforms.uOpacity.value = clamped;
      this._axisMaterials.z.uniforms.uOpacity.value = clamped;
    }
    if (axX) {
      this._gridUniforms.uAxisXColor.value.setStyle(axX);
      this._axisMaterials.x.uniforms.uColor.value.setStyle(axX);
    }
    if (axY) {
      this._gridUniforms.uAxisYColor.value.setStyle(axY);
      this._axisMaterials.y.uniforms.uColor.value.setStyle(axY);
    }
    if (axZ) {
      this._gridUniforms.uAxisZColor.value.setStyle(axZ);
      this._axisMaterials.z.uniforms.uColor.value.setStyle(axZ);
    }
  }

  update(_dt, ctx) {
    if (!this.group.visible) return;
    const camPos = ctx?.cameraPosition;
    if (camPos) {
      this._gridUniforms.uCameraPos.value.copy(camPos);
      const step = this._minorSpacing * this._majorEvery;
      const snappedX = Math.round(camPos.x / step) * step;
      const snappedZ = Math.round(camPos.z / step) * step;
      this.gridMesh.position.set(snappedX, 0, snappedZ);
    }
  }

  dispose() {
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
    this.scene.remove(this.group);
    this.gridMesh.geometry?.dispose?.();
    this.gridMesh.material?.dispose?.();
    for (const geo of this._axisGeometries) geo?.dispose?.();
    for (const mat of Object.values(this._axisMaterials)) mat?.dispose?.();
  }
}
