import defaultUiSettings from '@/config/uiSettings.json';

function extractParenthetical(value) {
  if (!value) return 'N/A';
  const match = String(value).match(/\(([^)]+)\)/);
  return match ? match[1].trim() : String(value).trim();
}

function parseRendererDetails(rawRenderer, gl) {
  const rawGlsl = gl?.getParameter(gl.SHADING_LANGUAGE_VERSION) || '';
  const fallback = {
    gpu: rawRenderer || 'Unknown GPU',
    backend: 'WebGL',
    vs: 'N/A',
    ps: 'N/A',
    glsl: extractParenthetical(rawGlsl),
  };

  if (!rawRenderer) return fallback;

  const vsMatch = rawRenderer.match(/\b(vs_\d+_\d+)\b/i);
  const psMatch = rawRenderer.match(/\b(ps_\d+_\d+)\b/i);

  let backend = 'WebGL';
  if (/direct3d\s*12|d3d12/i.test(rawRenderer)) backend = 'Direct3D 12';
  else if (/direct3d\s*11|d3d11/i.test(rawRenderer)) backend = 'Direct3D 11';
  else if (/vulkan/i.test(rawRenderer)) backend = 'Vulkan';
  else if (/metal/i.test(rawRenderer)) backend = 'Metal';
  else if (/opengl/i.test(rawRenderer)) backend = 'OpenGL';

  let gpu = rawRenderer.trim();
  const angleMatch = gpu.match(/^ANGLE\s*\((.+)\)$/i);
  if (angleMatch) {
    const inner = angleMatch[1];
    const commaIdx = inner.indexOf(',');
    let modelPart = commaIdx >= 0 ? inner.slice(commaIdx + 1).trim() : inner.trim();

    modelPart = modelPart
      .replace(/\s*\(0x[0-9a-fA-F]+\)/g, '')
      .replace(/\s+(Direct3D\d+|Vulkan|Metal|OpenGL\s*ES).*$/i, '')
      .replace(/,\s*(D3D\d+|Vulkan|Metal).*$/i, '')
      .replace(/^ANGLE\s+Metal\s+Renderer:\s*/i, '')
      .trim();

    if (modelPart) gpu = modelPart;
  } else {
    gpu = gpu.replace(/\s*\(0x[0-9a-fA-F]+\)/g, '').trim();
  }

  return {
    gpu,
    backend,
    vs: vsMatch ? vsMatch[1] : 'N/A',
    ps: psMatch ? psMatch[1] : 'N/A',
    glsl: extractParenthetical(rawGlsl),
  };
}

class GpuTimer {
  constructor(gl, maxPending = 8) {
    this.gl = gl;
    this.ext = null;
    this.lastGpuMs = null;
    this._activeQuery = null;
    this._pending = [];
    this._maxPending = maxPending;

    if (!gl) return;

    this.ext =
      gl.getExtension('EXT_disjoint_timer_query_webgl2') ||
      gl.getExtension('EXT_disjoint_timer_query') ||
      null;
  }

  _deleteQuery(entry) {
    if (!this.ext || !entry?.query) return;
    if (entry.kind === 'webgl2') this.gl.deleteQuery(entry.query);
    else this.ext.deleteQueryEXT(entry.query);
  }

  beginFrame() {
    if (!this.ext || this._activeQuery) return;
    if (this._pending.length >= this._maxPending) return;

    const gl = this.gl;
    const ext = this.ext;

    if (typeof gl.createQuery === 'function' && ext.TIME_ELAPSED_EXT) {
      const query = gl.createQuery();
      if (!query) return;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      this._activeQuery = { kind: 'webgl2', query };
    } else if (typeof ext.createQueryEXT === 'function' && ext.TIME_ELAPSED_EXT) {
      const query = ext.createQueryEXT();
      if (!query) return;
      ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, query);
      this._activeQuery = { kind: 'webgl1', query };
    }
  }

  endFrame() {
    if (!this.ext || !this._activeQuery) return;

    const gl = this.gl;
    const ext = this.ext;
    const entry = this._activeQuery;
    this._activeQuery = null;

    if (entry.kind === 'webgl2') {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
    } else {
      ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
    }

    this._pending.push(entry);
    this.poll();
  }

  poll() {
    if (!this.ext || this._pending.length === 0) return;

    const gl = this.gl;
    const ext = this.ext;

    while (this._pending.length > 0) {
      const item = this._pending[0];
      const available =
        item.kind === 'webgl2'
          ? gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)
          : ext.getQueryObjectEXT(item.query, ext.QUERY_RESULT_AVAILABLE_EXT);

      if (!available) break;

      const ns =
        item.kind === 'webgl2'
          ? gl.getQueryParameter(item.query, gl.QUERY_RESULT)
          : ext.getQueryObjectEXT(item.query, ext.QUERY_RESULT_EXT);

      this._deleteQuery(item);
      this._pending.shift();

      if (typeof ns === 'number' && ns >= 0) {
        this.lastGpuMs = ns / 1e6;
      }
    }
  }

  dispose() {
    if (this._activeQuery) {
      this._deleteQuery(this._activeQuery);
      this._activeQuery = null;
    }
    for (const item of this._pending) {
      this._deleteQuery(item);
    }
    this._pending.length = 0;
  }
}

function detectSystemInfo(renderer) {
  const gl = renderer?.getContext?.();
  if (!gl) {
    return {
      gpu: 'Unavailable',
      backend: 'N/A',
      vs: 'N/A',
      ps: 'N/A',
      glsl: 'N/A',
    };
  }

  let rawRenderer = gl.getParameter(gl.RENDERER) || '';
  const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
  if (debugExt) {
    const unmasked = gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL);
    if (unmasked) rawRenderer = unmasked;
  }

  return parseRendererDetails(rawRenderer, gl);
}

export class StatsPanel {
  constructor({ eventBus, renderPipeline, config = defaultUiSettings }) {
    this.eventBus = eventBus;
    this.renderPipeline = renderPipeline;
    this.config = config;
    this.visible = Boolean(this.config.panels?.statsVisible);

    const gl = this.renderPipeline?.renderer?.getContext?.() ?? null;
    this._gpuTimer = new GpuTimer(gl);
    this._sysInfo = detectSystemInfo(this.renderPipeline?.renderer);

    this.el = document.createElement('aside');
    this.el.className = 'hud-panel hud-stats';

    this.header = document.createElement('div');
    this.header.className = 'hud-panel__header';
    this.header.textContent = 'Statistics';

    this.body = document.createElement('div');
    this.body.className = 'hud-stats__body';

    this.el.append(this.header, this.body);

    this._accumTime = 0;
    this._accumFrames = 0;
    this._fps = 0;
    this._frameMs = (0).toFixed(1);

    this._unsubs = [
      this.eventBus?.on?.('render:beforeFrame', () => {
        if (this.visible) this._gpuTimer.beginFrame();
      }),
      this.eventBus?.on?.('render:afterFrame', () => {
        if (this.visible) this._gpuTimer.endFrame();
      }),
      this.eventBus?.on?.('theme:applied', () => {
        this._renderBody(this.renderPipeline?.getTelemetry?.() ?? {});
      }),
    ].filter(Boolean);

    this._renderBody(this.renderPipeline?.getTelemetry?.() ?? {});
  }

  _line(value, label, muted = false) {
    const cls = muted ? 'hud-stats__line hud-stats__line--muted' : 'hud-stats__line';
    return `<div class="${cls}"><strong class="hud-stats__value">${value}</strong> <span class="hud-stats__label">${label}</span></div>`;
  }

  _divider() {
    return '<div class="hud-stats__divider"></div>';
  }

  _renderBody(info) {
    const calls = info.calls ?? 0;
    const triangles = info.triangles ?? 0;
    const gpuTimeText =
      this._gpuTimer.lastGpuMs !== null ? `${this._gpuTimer.lastGpuMs.toFixed(2)} ms` : 'N/A';

    this.body.innerHTML = [
      this._line(this._sysInfo.glsl, 'GLSL', true),
      this._line(this._sysInfo.backend, 'Graphics API', true),
      this._line(this._sysInfo.gpu, 'GPU', true),
      this._divider(),
      this._line(this._fps, 'FPS'),
      this._line(`${this._frameMs} ms`, 'Frame Time'),
      this._line(gpuTimeText, 'GPU Time'),
      this._line(triangles, 'Triangles'),
      this._line(calls, 'Draw Calls'),
    ].join('');
  }

  mount(parent) {
    parent.appendChild(this.el);
    this.setVisible(this.visible);
  }

  setVisible(next) {
    this.visible = Boolean(next);
    this.el.style.display = this.visible ? '' : 'none';
  }

  toggle() {
    this.setVisible(!this.visible);
  }

  update(dt) {
    if (!this.visible) return;

    this._gpuTimer.poll();
    this._accumTime += dt;
    this._accumFrames += 1;

    const sampleWindowSec = 0.25;
    if (this._accumTime >= sampleWindowSec) {
      this._fps = Math.round(this._accumFrames / this._accumTime);
      this._frameMs = ((this._accumTime / this._accumFrames) * 1000).toFixed(1);
      this._accumTime = 0;
      this._accumFrames = 0;

      this._renderBody(this.renderPipeline?.getTelemetry?.() ?? {});
    }
  }

  dispose() {
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
    this._gpuTimer.dispose();
    this.el.remove();
  }
}
