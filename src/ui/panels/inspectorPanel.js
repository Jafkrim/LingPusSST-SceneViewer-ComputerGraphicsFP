import * as THREE from 'three';
import defaultUiSettings from '@/config/uiSettings.json';

const DEG2RAD = THREE.MathUtils.DEG2RAD;
const RAD2DEG = THREE.MathUtils.RAD2DEG;

function roundToPrecision(value, precision) {
  const factor = 10 ** precision;
  const rounded = Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export class InspectorPanel {
  constructor({ eventBus, config = defaultUiSettings }) {
    this.eventBus = eventBus;
    this.config = config;
    this._selectedObjects = [];
    this._inputs = new Map();
    this._resetButtons = new Map();

    const scaleRowCfg = (this._getInspectorConfig().rows ?? []).find((r) => r.key === 'scale');
    this._uniformScale = Boolean(scaleRowCfg?.uniformToggle?.enabledDefault);

    this.el = document.createElement('div');
    this.el.className = 'hud-ed__tab-pane hud-inspector-panel';

    this._unsubs = [
      this.eventBus?.on?.('selection:changed', ({ objects, object } = {}) => {
        this._selectedObjects = Array.isArray(objects)
          ? objects
          : object
            ? [object]
            : [];
        this.render();
      }),
      this.eventBus?.on?.('scene:selectionChanged', ({ objects, object } = {}) => {
        const nextList = Array.isArray(objects)
          ? objects
          : object
            ? [object]
            : [];
        const same =
          nextList.length === this._selectedObjects.length &&
          nextList.every((o, i) => o === this._selectedObjects[i]);
        if (!same) {
          this._selectedObjects = nextList;
          this.render();
        }
      }),
      this.eventBus?.on?.('scene:entityRemoved', ({ id } = {}) => {
        const next = this._selectedObjects.filter((o) => o?.userData?.entityId !== id);
        if (next.length !== this._selectedObjects.length) {
          this._selectedObjects = next;
          this.render();
        }
      }),
      this.eventBus?.on?.('scene:changed', () => {
        if (this._selectedObject) {
          this._syncValuesFromObject();
        }
      }),
      this.eventBus?.on?.('theme:applied', () => {
        if (this._selectedObject) {
          this.render();
        }
      }),
    ].filter(Boolean);
  }

  get _selectedObject() {
    return this._selectedObjects.length === 1 ? this._selectedObjects[0] : null;
  }

  _getInspectorConfig() {
    return {
      ...defaultUiSettings.inspectorPanel,
      ...(this.config?.inspectorPanel ?? {}),
    };
  }

  _readAxisDisplayValue(obj, rowKey, axisIndex, precision) {
    const axisProp = axisIndex === 0 ? 'x' : axisIndex === 1 ? 'y' : 'z';
    if (rowKey === 'rotation') {
      return roundToPrecision(obj.rotation[axisProp] * RAD2DEG, precision);
    }
    return roundToPrecision(obj[rowKey][axisProp], precision);
  }

  _applyScaleAxisValue(obj, axisIndex, nextPrimaryRaw, precision, baselineAxes = null) {
    const num = Number(nextPrimaryRaw);
    if (!Number.isFinite(num)) return;

    const minScale = 10 ** -precision;
    const safePrimary = num === 0 ? minScale : num;
    const props = ['x', 'y', 'z'];

    if (!this._uniformScale) {
      obj.scale[props[axisIndex]] = safePrimary;
    } else {
      const refAxes = baselineAxes ?? [obj.scale.x, obj.scale.y, obj.scale.z];
      const refPrimary = refAxes[axisIndex];

      for (let i = 0; i < 3; i += 1) {
        if (i === axisIndex) {
          obj.scale[props[i]] = roundToPrecision(safePrimary, precision);
        } else if (Math.abs(refPrimary) > minScale) {
          const ratio = refAxes[i] / refPrimary;
          const scaled = roundToPrecision(safePrimary * ratio, precision);
          obj.scale[props[i]] = scaled === 0 ? minScale : scaled;
        } else {
          obj.scale[props[i]] = roundToPrecision(safePrimary, precision);
        }
      }
    }

    obj.updateMatrixWorld(true);
    this.eventBus?.emit?.('scene:changed', {
      reason: 'transform',
      id: obj.userData?.entityId ?? obj.uuid,
      property: 'scale',
    });
  }

  _writeAxisDisplayValue(obj, rowKey, axisIndex, rawDisplayValue, precision, baselineAxes = null) {
    if (rowKey === 'scale') {
      this._applyScaleAxisValue(obj, axisIndex, rawDisplayValue, precision, baselineAxes);
      return;
    }

    const num = Number(rawDisplayValue);
    if (!Number.isFinite(num)) return;

    const axisProp = axisIndex === 0 ? 'x' : axisIndex === 1 ? 'y' : 'z';
    if (rowKey === 'rotation') {
      obj.rotation[axisProp] = num * DEG2RAD;
    } else {
      obj.position[axisProp] = num;
    }

    obj.updateMatrixWorld(true);
    this.eventBus?.emit?.('scene:changed', {
      reason: 'transform',
      id: obj.userData?.entityId ?? obj.uuid,
      property: rowKey,
    });
  }

  _isRowAtDefault(obj, rowCfg) {
    const defaults = rowCfg.defaultValue ?? [0, 0, 0];
    const precision = rowCfg.precision;
    for (let i = 0; i < 3; i += 1) {
      const current = this._readAxisDisplayValue(obj, rowCfg.key, i, precision);
      const target = roundToPrecision(defaults[i], precision);
      if (Math.abs(current - target) > 10 ** -precision) {
        return false;
      }
    }
    return true;
  }

  _syncValuesFromObject() {
    const obj = this._selectedObject;
    if (!obj) return;

    const inspCfg = this._getInspectorConfig();
    for (const rowCfg of inspCfg.rows ?? []) {
      const precision = rowCfg.precision;
      for (let i = 0; i < 3; i += 1) {
        const input = this._inputs.get(`${rowCfg.key}:${i}`);
        if (!input || document.activeElement === input) continue;
        input.value = String(this._readAxisDisplayValue(obj, rowCfg.key, i, precision));
      }

      const resetBtn = this._resetButtons.get(rowCfg.key);
      if (resetBtn) {
        resetBtn.classList.toggle('is-default', this._isRowAtDefault(obj, rowCfg));
      }
    }
  }

  _attachAxisScrubber(tagEl, inputEl, rowCfg, axisIndex) {
    tagEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this._selectedObject) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startVal = Number(inputEl.value) || 0;
      const baseStep = Number(rowCfg.step);
      const precision = rowCfg.precision;
      const baselineAxes =
        rowCfg.key === 'scale'
          ? [
              this._selectedObject.scale.x,
              this._selectedObject.scale.y,
              this._selectedObject.scale.z,
            ]
          : null;

      tagEl.setPointerCapture?.(e.pointerId);

      const onMove = (moveEvt) => {
        if (!this._selectedObject) return;
        const dx = moveEvt.clientX - startX;
        const mult = moveEvt.shiftKey ? 0.1 : moveEvt.ctrlKey ? 10 : 1;
        const nextVal = roundToPrecision(startVal + dx * baseStep * mult, precision);
        inputEl.value = String(nextVal);
        this._writeAxisDisplayValue(
          this._selectedObject,
          rowCfg.key,
          axisIndex,
          nextVal,
          precision,
          baselineAxes
        );
        if (rowCfg.key === 'scale' && this._uniformScale) {
          this._syncValuesFromObject();
        }
      };

      const onUp = (upEvt) => {
        tagEl.releasePointerCapture?.(upEvt.pointerId);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  render() {
    this.el.innerHTML = '';
    this._inputs.clear();
    this._resetButtons.clear();

    const inspCfg = this._getInspectorConfig();
    const count = this._selectedObjects.length;

    if (count === 0) {
      const blank = document.createElement('div');
      blank.className = 'hud-ed__blank';
      blank.textContent = inspCfg.emptyText;
      this.el.appendChild(blank);
      return;
    }

    const isMulti = count > 1;
    const obj = isMulti ? null : this._selectedObjects[0];
    const multipleLabel = inspCfg.multipleValueText ?? 'Multiple';

    const headerEl = document.createElement('div');
    headerEl.className = 'hud-insp__header';

    const nameEl = document.createElement('span');
    nameEl.className = 'hud-insp__name';
    nameEl.textContent = isMulti ? `${count} objects selected` : obj.name || obj.type;
    nameEl.title = nameEl.textContent;
    headerEl.appendChild(nameEl);

    const groupEl = document.createElement('div');
    groupEl.className = 'hud-ed__group';

    const titleEl = document.createElement('div');
    titleEl.className = 'hud-ed__group-title';
    titleEl.textContent = inspCfg.transformSectionTitle;

    const gridEl = document.createElement('div');
    gridEl.className = 'hud-insp__transform-grid';

    const axesCfg = inspCfg.axes ?? [];
    const fallbackCssVar = inspCfg.fallbackCssVar;

    for (const rowCfg of inspCfg.rows ?? []) {
      const precision = rowCfg.precision;

      const rowHead = document.createElement('div');
      rowHead.className = 'hud-insp__row-head';

      const rowLabel = document.createElement('span');
      rowLabel.className = 'hud-insp__row-label';
      rowLabel.textContent = rowCfg.label;
      rowHead.appendChild(rowLabel);

      if (rowCfg.uniformToggle) {
        const uniformBtn = document.createElement('button');
        uniformBtn.type = 'button';
        uniformBtn.className = 'hud-insp__uniform-btn';
        uniformBtn.textContent = rowCfg.uniformToggle.label;
        uniformBtn.title = rowCfg.uniformToggle.title;
        uniformBtn.setAttribute('aria-pressed', String(this._uniformScale));
        uniformBtn.classList.toggle('is-active', this._uniformScale);

        uniformBtn.disabled = isMulti;
        uniformBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isMulti) return;
          this._uniformScale = !this._uniformScale;
          uniformBtn.setAttribute('aria-pressed', String(this._uniformScale));
          uniformBtn.classList.toggle('is-active', this._uniformScale);
        });

        rowHead.appendChild(uniformBtn);
      }

      const axesWrap = document.createElement('div');
      axesWrap.className = 'hud-insp__axes';

      for (const axis of axesCfg) {
        const box = document.createElement('div');
        box.className = 'hud-insp__axis-box';
        box.style.setProperty('--axis-color', `var(${axis.cssVar}, var(${fallbackCssVar}))`);

        const tag = document.createElement('span');
        tag.className = 'hud-insp__axis-tag';
        tag.textContent = axis.label;

        const input = document.createElement('input');
        input.className = 'hud-insp__axis-input';

        if (isMulti) {
          input.type = 'text';
          input.value = multipleLabel;
          input.disabled = true;
          input.readOnly = true;
        } else {
          input.type = 'number';
          input.step = String(rowCfg.step);
          input.value = String(this._readAxisDisplayValue(obj, rowCfg.key, axis.index, precision));

          const commitInput = () => {
            if (!this._selectedObject) return;
            this._writeAxisDisplayValue(
              this._selectedObject,
              rowCfg.key,
              axis.index,
              input.value,
              precision
            );
            this._syncValuesFromObject();
          };

          input.addEventListener('change', commitInput);
          input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              commitInput();
              input.blur();
            } else if (e.key === 'Escape') {
              this._syncValuesFromObject();
              input.blur();
            }
          });

          this._attachAxisScrubber(tag, input, rowCfg, axis.index);
        }

        this._inputs.set(`${rowCfg.key}:${axis.index}`, input);

        box.append(tag, input);
        axesWrap.appendChild(box);
      }

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'hud-insp__reset-btn';
      resetBtn.title = rowCfg.resetTitle;
      resetBtn.textContent = '↺';
      resetBtn.disabled = isMulti;
      resetBtn.classList.toggle('is-default', isMulti || this._isRowAtDefault(obj, rowCfg));

      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this._selectedObject) return;
        const defaults = rowCfg.defaultValue;
        const wasUniform = this._uniformScale;
        this._uniformScale = false;
        for (let i = 0; i < 3; i += 1) {
          this._writeAxisDisplayValue(this._selectedObject, rowCfg.key, i, defaults[i], precision);
        }
        this._uniformScale = wasUniform;
        this._syncValuesFromObject();
      });

      this._resetButtons.set(rowCfg.key, resetBtn);
      gridEl.append(rowHead, axesWrap, resetBtn);
    }

    groupEl.append(titleEl, gridEl);
    this.el.append(headerEl, groupEl);
  }

  applyConfig(nextConfig = {}) {
    this.config = nextConfig;
    this.render();
  }

  setActive(active) {
    this.el.style.display = active ? 'flex' : 'none';
  }

  mount(parent) {
    parent.appendChild(this.el);
    this.render();
  }

  dispose() {
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
    this._inputs.clear();
    this._resetButtons.clear();
    this.el.remove();
  }
}
