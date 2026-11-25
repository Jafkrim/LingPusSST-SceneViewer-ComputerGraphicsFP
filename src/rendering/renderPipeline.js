import * as THREE from 'three';
import { EVENTS } from '@/engine/eventBus.js';
import { PrStyle } from './styles/prStyle.js';

export class RenderPipeline {
  constructor(canvas, scene, camera, eventBus) {
    this.canvas = canvas;
    this.scene = scene;
    this.camera = camera;
    this.eventBus = eventBus;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(
      canvas.clientWidth || window.innerWidth,
      canvas.clientHeight || window.innerHeight,
      false
    );

    this.styles = new Map();
    this.activeStyle = null;
    this.activeStyleName = null;

    this.registerStyle('pr', new PrStyle(this.renderer, this.scene, this.camera, this.eventBus));
    this.setStyle('pr');
  }

  registerStyle(name, style) {
    this.styles.set(name, style);
  }

  setStyle(name) {
    const next = this.styles.get(name);
    if (!next || next === this.activeStyle) return;

    this.activeStyle?.deactivate();
    this.activeStyle = next;
    this.activeStyleName = name;
    this.activeStyle.activate();

    this.eventBus?.emit(EVENTS.STYLE_CHANGED, { style: name });
  }

  getDebugGpuInfo() {
    const gl = this.renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);

    const isWebGL2 = this.renderer.capabilities.isWebGL2;
    const version = gl.getParameter(gl.VERSION);
    const glslVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);

    return {
      gpu,
      api: version || (isWebGL2 ? 'WebGL 2.0' : 'WebGL 1.0'),
      shaderModel: isWebGL2 ? 'GLSL ES 3.00 (SM 3.0+)' : 'GLSL ES 1.00',
      vertexShader: glslVersion,
      pixelShader: glslVersion
    };
  }

  resize(width, height) {
    this.renderer.setSize(width, height, false);
    this.activeStyle?.resize(width, height);
  }

  update(dt) {
    this.activeStyle?.update(dt);
  }

  render(dt) {
    this.activeStyle?.render(dt);
  }

  dispose() {
    for (const style of this.styles.values()) {
      style.dispose();
    }
    this.renderer.dispose();
  }
}
