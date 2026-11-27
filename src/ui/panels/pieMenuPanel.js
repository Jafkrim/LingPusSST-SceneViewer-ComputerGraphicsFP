import defaultUiSettings from '@/config/uiSettings.json';

function normalizeAngleDeg(deg) {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

function angularDistanceDeg(a, b) {
  return Math.abs(normalizeAngleDeg(a - b));
}

function isEditableElement(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function getDefaultStartAngle(count) {
  if (count === 2) return 180;
  if (count === 4) return -135;
  return -90;
}

export class PieMenuPanel {
  constructor({
    eventBus,
    pawnManager = null,
    contentBrowserPanel = null,
    editorPanel = null,
    statsPanel = null,
    viewportGizmoPanel = null,
    settingsPanel = null,
    config = defaultUiSettings,
  }) {
    this.eventBus = eventBus;
    this.pawnManager = pawnManager;
    this.contentBrowserPanel = contentBrowserPanel;
    this.editorPanel = editorPanel;
    this.statsPanel = statsPanel;
    this.viewportGizmoPanel = viewportGizmoPanel;
    this.settingsPanel = settingsPanel;
    this.config = config;

    this.visible = false;
    this._closing = false;
    this._closeTimer = null;
    this._openRaf = null;
    this._armedForSelection = false;

    this._activeMenuId = null;
    this._activeItems = [];
    this._activeItemId = null;
    this._centerX = 0;
    this._centerY = 0;
    this._lastPointerX = window.innerWidth * 0.5;
    this._lastPointerY = window.innerHeight * 0.5;
    this._hasPointer = false;

    this.el = document.createElement('div');
    this.el.className = 'hud-pie-overlay';
    this.el.setAttribute('data-ui-interactive', 'true');
    this.el.style.display = 'none';

    this._centerEl = document.createElement('div');
    this._centerEl.className = 'hud-pie__center';

    this._ringEl = document.createElement('div');
    this._ringEl.className = 'hud-pie__ring';

    this._arcEl = document.createElement('div');
    this._arcEl.className = 'hud-pie__ring-arc';
    this._ringEl.appendChild(this._arcEl);

    this._virtualCursorEl = document.createElement('div');
    this._virtualCursorEl.className = 'hud-pie__cursor';
    this._virtualCursorEl.style.display = 'none';

    this._centerEl.append(this._ringEl, this._virtualCursorEl);
    this.el.appendChild(this._centerEl);

    this._itemsContainer = document.createElement('div');
    this.el.appendChild(this._itemsContainer);
    this._itemEls = new Map();

    this._onWindowPointerMove = (e) => {
      this._lastPointerX = e.clientX;
      this._lastPointerY = e.clientY;
      this._hasPointer = true;
      if (this._virtualCursorEl.style.display !== 'none') {
        this._virtualCursorEl.style.display = 'none';
      }
      if (this.visible && !this._closing) {
        this._armedForSelection = true;
        this._updateSelectionFromPointer(e.clientX, e.clientY);
      }
    };

    this._onWindowPointerDown = (e) => {
      if (!this.visible || this._closing) return;
      if (e.button === 2) {
        e.preventDefault();
        this.cancel();
      } else if (e.button === 0 && !this.el.contains(e.target)) {
        this.confirm();
      }
    };

    this._onWindowKeyDown = (e) => {
      if (e.code === 'Tab' && !isEditableElement(e.target)) {
        e.preventDefault();
      }

      if (!this.visible || this._closing) return;

      if (e.code === 'Escape') {
        e.preventDefault();
        this.cancel();
      }
    };

    this._onWindowKeyUp = (e) => {
      if (e.code === 'Tab' && !isEditableElement(e.target)) {
        e.preventDefault();
        if (this.visible && !this._closing) {
          this.confirm();
        }
      }
    };

    this._onWindowBlur = () => {
      if (this.visible && !this._closing) this.cancel();
    };

    window.addEventListener('pointermove', this._onWindowPointerMove, { passive: true });
    window.addEventListener('pointerdown', this._onWindowPointerDown, true);
    window.addEventListener('keydown', this._onWindowKeyDown, true);
    window.addEventListener('keyup', this._onWindowKeyUp, true);
    window.addEventListener('blur', this._onWindowBlur);
  }

  _getPieConfig() {
    return {
      ...defaultUiSettings.pieMenu,
      ...(this.config.pieMenu ?? {}),
    };
  }

  _getAnimConfig() {
    const anim = {
      ...defaultUiSettings.animations,
      ...(this.config.animations ?? {}),
    };
    const enabled = Boolean(anim.enabled && anim.pie);
    return {
      enabled,
      durationMs: enabled ? Math.max(0, Number(anim.durationMs ?? 160)) : 0,
    };
  }

  _getUiScale() {
    const cssScale = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')
    );
    if (Number.isFinite(cssScale) && cssScale > 0) return cssScale;
    return (Number(this.config.uiScale?.value ?? 100) || 100) / 100;
  }

  _getVisibleViewportRect() {
    const scale = this._getUiScale();
    let right = window.innerWidth;
    let bottom = window.innerHeight;

    if (this.editorPanel?.visible && this.editorPanel?.el) {
      const rect = this.editorPanel.el.getBoundingClientRect();
      if (rect.width > 0) {
        right = Math.min(right, rect.left);
      } else {
        right -= Number(this.config.editorPanel?.widthPx ?? 300) * scale;
      }
    }

    if (this.contentBrowserPanel?.visible && this.contentBrowserPanel?.el) {
      const rect = this.contentBrowserPanel.el.getBoundingClientRect();
      if (rect.height > 0) {
        bottom = Math.min(bottom, rect.top);
      } else {
        bottom -= 270 * scale;
      }
    }

    return {
      left: 0,
      top: 0,
      right: Math.max(200, right),
      bottom: Math.max(200, bottom),
    };
  }

  _resolveMenuItems(menuDef) {
    const rawItems = Array.isArray(menuDef.items) ? menuDef.items : [];
    const count = rawItems.length;
    if (count === 0) return [];

    const step = 360 / count;
    const startAngle =
      typeof menuDef.startAngleDeg === 'number'
        ? menuDef.startAngleDeg
        : getDefaultStartAngle(count);

    return rawItems.map((item, idx) => ({
      ...item,
      angleDeg: typeof item.angleDeg === 'number' ? item.angleDeg : startAngle + step * idx,
    }));
  }

  _measurePillExtents() {
    const scale = this._getUiScale();
    let halfW = 58 * scale;
    let halfH = 18 * scale;
    for (const btn of this._itemEls.values()) {
      const rect = btn.getBoundingClientRect();
      if (rect.width > 0) halfW = Math.max(halfW, rect.width * 0.5);
      if (rect.height > 0) halfH = Math.max(halfH, rect.height * 0.5);
    }
    return { halfW, halfH };
  }

  _getEffectiveRadii(resolvedItems = this._activeItems) {
    const pieCfg = this._getPieConfig();
    const scale = this._getUiScale();
    const ringRadius = Number(pieCfg.ringRadiusPx ?? 18) * scale;
    const { halfW: pillHalfW } = this._measurePillExtents();

    let rx = Number(pieCfg.radiusPx ?? 116) * scale;
    if (resolvedItems.length === 2) {
      rx = Math.max(rx, pillHalfW + ringRadius + 18 * scale);
    }
    const ry = rx * Number(pieCfg.verticalFactor ?? 0.64);
    return { rx, ry };
  }

  _clampCenterToViewport(rawX, rawY, resolvedItems) {
    const pieCfg = this._getPieConfig();
    const scale = this._getUiScale();
    const bounds = this._getVisibleViewportRect();
    const pad = Number(pieCfg.edgePaddingPx ?? 16) * scale;
    const { halfW: pillHalfW, halfH: pillHalfH } = this._measurePillExtents();
    const { rx, ry } = this._getEffectiveRadii(resolvedItems);

    let maxExtentX = 0;
    let maxExtentY = 0;
    for (const item of resolvedItems) {
      const rad = (item.angleDeg * Math.PI) / 180;
      maxExtentX = Math.max(maxExtentX, Math.abs(Math.cos(rad)) * rx);
      maxExtentY = Math.max(maxExtentY, Math.abs(Math.sin(rad)) * ry);
    }

    const totalHalfW = maxExtentX + pillHalfW;
    const totalHalfH = maxExtentY + pillHalfH;
    const marginX = totalHalfW + pad;
    const marginY = totalHalfH + pad;

    const minX = bounds.left + marginX;
    const maxX = bounds.right - marginX;
    const minY = bounds.top + marginY;
    const maxY = bounds.bottom - marginY;

    let cx =
      minX <= maxX ? Math.min(maxX, Math.max(minX, rawX)) : (bounds.left + bounds.right) * 0.5;
    let cy =
      minY <= maxY ? Math.min(maxY, Math.max(minY, rawY)) : (bounds.top + bounds.bottom) * 0.5;

    if (this.statsPanel?.visible && this.statsPanel?.el) {
      const sRect = this.statsPanel.el.getBoundingClientRect();
      if (sRect.width > 0 && sRect.height > 0) {
        const pieLeft = cx - totalHalfW;
        const pieTop = cy - totalHalfH;
        const targetLeft = sRect.right + pad;
        const targetTop = sRect.bottom + pad;
        if (pieLeft < targetLeft && pieTop < targetTop) {
          const shiftX = targetLeft - pieLeft;
          const shiftY = targetTop - pieTop;
          if (shiftX <= shiftY && cx + shiftX <= maxX) {
            cx += shiftX;
          } else if (cy + shiftY <= maxY) {
            cy += shiftY;
          } else {
            cx = Math.min(maxX, cx + shiftX);
          }
        }
      }
    }

    if (this.viewportGizmoPanel?.visible && this.viewportGizmoPanel?.el) {
      const gRect = this.viewportGizmoPanel.el.getBoundingClientRect();
      if (gRect.width > 0 && gRect.height > 0) {
        const pieRight = cx + totalHalfW;
        const pieTop = cy - totalHalfH;
        const targetRight = gRect.left - pad;
        const targetTop = gRect.bottom + pad;
        if (pieRight > targetRight && pieTop < targetTop) {
          const shiftX = pieRight - targetRight;
          const shiftY = targetTop - pieTop;
          if (shiftX <= shiftY && cx - shiftX >= minX) {
            cx -= shiftX;
          } else if (cy + shiftY <= maxY) {
            cy += shiftY;
          } else {
            cx = Math.max(minX, cx - shiftX);
          }
        }
      }
    }

    return { x: cx, y: cy };
  }

  _buildMenuDOM(resolvedItems) {
    this._itemsContainer.innerHTML = '';
    this._itemEls.clear();
    this._activeItems = resolvedItems;

    for (const item of resolvedItems) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.tabIndex = -1;
      btn.className = 'hud-pie__item';
      btn.dataset.pieId = item.id;
      btn.textContent = String(item.label ?? item.id);

      // Selection is driven strictly by radial distance outside the center ring + angle,
      // never by DOM hover on the button text box. Click confirms the radially active slice.
      btn.addEventListener('pointerdown', (e) => {
        if (e.button === 0 && !this._closing) {
          e.stopPropagation();
          this.confirm(this._activeItemId ?? item.id);
        }
      });

      this._itemEls.set(item.id, btn);
      this._itemsContainer.appendChild(btn);
    }
  }

  _clearPendingTransitions() {
    if (this._closeTimer !== null) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }
    if (this._openRaf !== null) {
      cancelAnimationFrame(this._openRaf);
      this._openRaf = null;
    }
    this._closing = false;
  }

  open(menuId) {
    if (this.settingsPanel?.visible) return;

    const pieCfg = this._getPieConfig();
    const menuDef = pieCfg.menus?.[menuId];
    if (!menuDef) return;

    const ringDiameter = Number(pieCfg.ringRadiusPx ?? 18) * 2;
    this._ringEl.style.setProperty('--pie-ring-size', `${ringDiameter}px`);

    if (this.visible && !this._closing && this._activeMenuId === menuId) return;

    this._clearPendingTransitions();
    this._armedForSelection = false;

    if (document.activeElement instanceof HTMLElement && !isEditableElement(document.activeElement)) {
      document.activeElement.blur();
    }

    const mode = this.pawnManager?.activeMode ?? 'surveyor';
    const isFlyOrWalk = mode !== 'surveyor';
    const bounds = this._getVisibleViewportRect();

    let desiredX;
    let desiredY;

    if (isFlyOrWalk) {
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      this.pawnManager?.setMode?.('surveyor');
      desiredX = (bounds.left + bounds.right) * 0.5;
      desiredY = (bounds.top + bounds.bottom) * 0.5;
    } else if (this._hasPointer) {
      desiredX = this._lastPointerX;
      desiredY = this._lastPointerY;
    } else {
      desiredX = (bounds.left + bounds.right) * 0.5;
      desiredY = (bounds.top + bounds.bottom) * 0.5;
    }

    const resolvedItems = this._resolveMenuItems(menuDef);
    this._activeMenuId = menuId;
    this._buildMenuDOM(resolvedItems);

    this.visible = true;
    this.el.style.visibility = 'hidden';
    this.el.style.display = 'block';

    const clamped = this._clampCenterToViewport(desiredX, desiredY, resolvedItems);
    this._centerX = clamped.x;
    this._centerY = clamped.y;

    this._virtualCursorEl.style.display = isFlyOrWalk ? 'block' : 'none';
    this._setActiveItem(null);

    const anim = this._getAnimConfig();
    if (anim.enabled && anim.durationMs > 0) {
      this._positionAtCenter(true);
      void this._centerEl.offsetWidth;
      this.el.style.visibility = 'visible';
      this._openRaf = requestAnimationFrame(() => {
        this._openRaf = null;
        this._layoutItems(false);
      });
    } else {
      this._layoutItems(false);
      this.el.style.visibility = 'visible';
    }
  }

  _positionAtCenter(collapsed) {
    this._centerEl.style.left = `${this._centerX}px`;
    this._centerEl.style.top = `${this._centerY}px`;
    this._centerEl.classList.toggle('is-collapsed', collapsed);

    for (const item of this._activeItems) {
      const btn = this._itemEls.get(item.id);
      if (!btn) continue;
      btn.style.left = `${this._centerX}px`;
      btn.style.top = `${this._centerY}px`;
      btn.classList.toggle('is-collapsed', collapsed);
    }
  }

  _layoutItems(collapsed = false) {
    const { rx, ry } = this._getEffectiveRadii(this._activeItems);

    this._centerEl.style.left = `${this._centerX}px`;
    this._centerEl.style.top = `${this._centerY}px`;
    this._centerEl.classList.toggle('is-collapsed', collapsed);

    for (const item of this._activeItems) {
      const btn = this._itemEls.get(item.id);
      if (!btn) continue;
      const rad = (item.angleDeg * Math.PI) / 180;
      const ix = this._centerX + Math.cos(rad) * rx;
      const iy = this._centerY + Math.sin(rad) * ry;
      btn.style.left = `${ix}px`;
      btn.style.top = `${iy}px`;
      btn.classList.toggle('is-collapsed', collapsed);
    }
  }

  _updateSelectionFromPointer(px, py) {
    const pieCfg = this._getPieConfig();
    const scale = this._getUiScale();
    const dx = px - this._centerX;
    const dy = py - this._centerY;
    const dist = Math.hypot(dx, dy);

    // Only select once the cursor moves outside the center circle deadzone
    const deadzone = Math.max(
      Number(pieCfg.deadzonePx ?? 22),
      Number(pieCfg.ringRadiusPx ?? 18)
    ) * scale;

    if (dist < deadzone) {
      this._setActiveItem(null);
      return;
    }

    const pointerDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    let bestItem = null;
    let bestDiff = Infinity;

    for (const item of this._activeItems) {
      const diff = angularDistanceDeg(pointerDeg, item.angleDeg);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestItem = item;
      }
    }

    this._setActiveItem(bestItem ? bestItem.id : null);
  }

  _setActiveItem(id) {
    this._activeItemId = id;

    for (const item of this._activeItems) {
      const btn = this._itemEls.get(item.id);
      btn?.classList.toggle('is-active', item.id === id);
    }

    const activeItem = this._activeItems.find((it) => it.id === id) ?? null;
    if (activeItem) {
      const cssDeg = activeItem.angleDeg + 90;
      this._arcEl.style.opacity = '1';
      this._arcEl.style.transform = `rotate(${cssDeg}deg)`;
    } else {
      this._arcEl.style.opacity = '0';
    }
  }

  confirm(overrideId = null, expectedMenuId = null) {
    if (!this.visible || this._closing) return;
    if (expectedMenuId && this._activeMenuId !== expectedMenuId) return;

    const chosenId = overrideId ?? this._activeItemId;
    const chosen = this._activeItems.find((it) => it.id === chosenId) ?? null;

    this._closeAnimated();

    if (chosen?.event) {
      this.eventBus?.emit?.(chosen.event, structuredClone(chosen.payload ?? {}));
    }
  }

  cancel() {
    if (!this.visible || this._closing) return;
    this._closeAnimated();
  }

  _closeAnimated() {
    this._clearPendingTransitions();
    this._armedForSelection = false;

    const anim = this._getAnimConfig();
    if (!anim.enabled || anim.durationMs <= 0) {
      this._finishClose();
      return;
    }

    this._closing = true;
    this._positionAtCenter(true);
    this._closeTimer = setTimeout(() => {
      this._closeTimer = null;
      this._finishClose();
    }, anim.durationMs);
  }

  _finishClose() {
    this._closing = false;
    this._armedForSelection = false;
    this.visible = false;
    this._activeMenuId = null;
    this._activeItems = [];
    this._activeItemId = null;
    this._virtualCursorEl.style.display = 'none';
    this.el.style.display = 'none';
  }

  mount(parent) {
    parent.appendChild(this.el);
  }

  dispose() {
    this._clearPendingTransitions();
    window.removeEventListener('pointermove', this._onWindowPointerMove);
    window.removeEventListener('pointerdown', this._onWindowPointerDown, true);
    window.removeEventListener('keydown', this._onWindowKeyDown, true);
    window.removeEventListener('keyup', this._onWindowKeyUp, true);
    window.removeEventListener('blur', this._onWindowBlur);
    this.el.remove();
  }
}
