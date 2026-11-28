import * as THREE from 'three';
import defaultUiSettings from '@/config/uiSettings.json';

const AXES = Object.freeze([
  { id: 'x', label: 'x', vec: new THREE.Vector3(1, 0, 0), token: '--axis-x' },
  { id: 'y', label: 'y', vec: new THREE.Vector3(0, 1, 0), token: '--axis-y' },
  { id: 'z', label: 'z', vec: new THREE.Vector3(0, 0, 1), token: '--axis-z' },
]);

export class ViewportGizmoPanel {
  constructor({ eventBus, pawnManager = null, config = defaultUiSettings }) {
    this.eventBus = eventBus;
    this.pawnManager = pawnManager;
    this.config = config;
    this.visible = Boolean(this.config.panels?.viewportGizmoVisible ?? true);

    this.el = document.createElement('aside');
    this.el.className = 'hud-viewport-gizmo';
    this.el.setAttribute('aria-hidden', 'true');

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hud-viewport-gizmo__canvas';
    this.el.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this._invQuat = new THREE.Quaternion();
    this._tmpVec = new THREE.Vector3();

    this._colors = {
      '--axis-x': '#ff0000',
      '--axis-y': '#00ff00',
      '--axis-z': '#0000ff',
    };

    this._syncThemeColors();

    this._unsubs = [
      this.eventBus?.on?.('theme:applied', () => this._syncThemeColors()),
    ].filter(Boolean);
  }

  _getGizmoConfig() {
    return {
      ...defaultUiSettings.viewportGizmo,
      ...(this.config.viewportGizmo ?? {}),
    };
  }

  _getUiScale() {
    const cssScale = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')
    );
    if (Number.isFinite(cssScale) && cssScale > 0) return cssScale;
    return (Number(this.config.uiScale?.value ?? 100) || 100) / 100;
  } 

  _syncThemeColors() {
    const styles = getComputedStyle(document.documentElement);
    for (const key of Object.keys(this._colors)) {
      const val = styles.getPropertyValue(key).trim();
      if (val) this._colors[key] = val;
    }
  }

  update() {
    if (!this.visible || !this.ctx) return;

    const cfg = this._getGizmoConfig();
    const scale = this._getUiScale();
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const sizeLogical = Math.round(Number(cfg.sizePx ?? 84) * scale);
    const targetPx = Math.max(1, Math.round(sizeLogical * dpr));

    if (
      this.canvas.width !== targetPx ||
      this.canvas.height !== targetPx ||
      this._lastSizeLogical !== sizeLogical
    ) {
      this._lastSizeLogical = sizeLogical;
      this.canvas.width = targetPx;
      this.canvas.height = targetPx;
      this.canvas.style.width = `${sizeLogical}px`;
      this.canvas.style.height = `${sizeLogical}px`;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, sizeLogical, sizeLogical);

    const cx = sizeLogical * 0.5;
    const cy = sizeLogical * 0.5;
    const armLen = Number(cfg.armLengthPx ?? 26) * scale;
    const labelOffset = Number(cfg.labelOffsetPx ?? 9) * scale;
    const lineW = Number(cfg.lineWidthPx ?? 2.5) * scale;

    const camera = this.pawnManager?.camera ?? null;
    if (camera) {
      this._invQuat.copy(camera.quaternion).invert();
    } else {
      this._invQuat.identity();
    }

    const projected = AXES.map((axis) => {
      this._tmpVec.copy(axis.vec).applyQuaternion(this._invQuat);
      return {
        ...axis,
        vz: this._tmpVec.z,
        ex: cx + this._tmpVec.x * armLen,
        ey: cy - this._tmpVec.y * armLen,
        lx: cx + this._tmpVec.x * (armLen + labelOffset),
        ly: cy - this._tmpVec.y * (armLen + labelOffset),
      };
    });

    // Depth sort back-to-front so nearer axes overlap cleanly
    projected.sort((a, b) => a.vz - b.vz);

    ctx.font = `700 ${Math.round(12 * scale)}px ui-monospace, 'Cascadia Code', Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineCap = 'round';

    for (const axis of projected) {
      const color = this._colors[axis.token];

      // Axis line segment (no bubble)
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(axis.ex, axis.ey);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineW;
      ctx.stroke();

      // Axis letter at tip
      ctx.fillStyle = color;
      ctx.fillText(axis.label, axis.lx, axis.ly);
    }

    ctx.restore();
  }

  mount(parent) {
    parent.appendChild(this.el);
    this.setVisible(this.visible);
  }

  setVisible(next) {
    this.visible = Boolean(next);
    this.el.style.display = this.visible ? 'block' : 'none';
  }

  toggle() {
    this.setVisible(!this.visible);
  }

  dispose() {
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
    this.el.remove();
  }
}
