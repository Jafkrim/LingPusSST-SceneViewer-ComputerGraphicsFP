import defaultUiSettings from '@/config/uiSettings.json';

export class ViewportToolbarPanel {
  constructor({ eventBus, pawnManager = null, config = defaultUiSettings }) {
    this.eventBus = eventBus;
    this.pawnManager = pawnManager;
    this.config = config;

    this.visible = true;
    this._openMenu = null;

    this._gizmoMode = config?.gizmo?.mode ?? 'none';
    this._gizmoSpace = config?.gizmo?.space ?? 'global';
    this._projection = config?.cameraOptions?.projection ?? 'perspective';
    this._fov = Number(config?.cameraOptions?.defaultFov ?? 60);
    this._near = Number(config?.cameraOptions?.defaultNear ?? 0.05);
    this._far = Number(config?.cameraOptions?.defaultFar ?? 2000);
    this._controllerMode = 'surveyor';
    this._viewMode = Number(config?.viewMode ?? 1);

    this.el = document.createElement('div');
    this.el.className = 'hud-viewport-toolbar';
    this.el.setAttribute('data-ui-interactive', 'true');

    this._gizmoBtns = new Map();
    this._spaceBtn = null;
    this._cameraDropBtn = null;
    this._controllerDropBtn = null;
    this._viewDropBtn = null;
    this._menus = new Map();

    this._buildUI();

    this._onDocPointerDown = (e) => {
      if (!this.el.contains(e.target)) {
        this._closeMenus();
      }
    };
    document.addEventListener('pointerdown', this._onDocPointerDown);

    this._unsubs = [
      this.eventBus.on('gizmo:modeChanged', ({ mode } = {}) => {
        if (mode) {
          this._gizmoMode = mode;
          this._syncState();
        }
      }),
      this.eventBus.on('gizmo:spaceChanged', ({ space } = {}) => {
        if (space) {
          this._gizmoSpace = space;
          this._syncState();
        }
      }),
      this.eventBus.on('camera:activeCameraChanged', ({ projection } = {}) => {
        if (projection) {
          this._projection = projection;
          this._syncState();
        }
      }),
      this.eventBus.on('camera:lensChanged', ({ fov, near, far, projection } = {}) => {
        if (typeof fov === 'number') this._fov = fov;
        if (typeof near === 'number') this._near = near;
        if (typeof far === 'number') this._far = far;
        if (projection) this._projection = projection;
        this._syncState();
      }),
      this.eventBus.on('pawn:modeChanged', ({ mode } = {}) => {
        if (mode) {
          this._controllerMode = mode;
          this._syncState();
        }
      }),
      this.eventBus.on('view:setMode', ({ mode } = {}) => {
        if (typeof mode === 'number') {
          this._viewMode = mode;
          this._syncState();
        }
      }),
      this.eventBus.on('ui:scaleChanged', () => {
        requestAnimationFrame(() => this.syncAdaptiveWidths());
      }),
      this.eventBus.on('settings:appearanceChanged', () => {
        requestAnimationFrame(() => this.syncAdaptiveWidths());
      }),
      this.eventBus.on('theme:applied', () => {
        requestAnimationFrame(() => this.syncAdaptiveWidths());
      }),
    ].filter(Boolean);

    if (document.fonts?.ready) {
      document.fonts.ready.then(() => this.syncAdaptiveWidths());
    }
  }

  _getToolbarCfg() {
    return {
      ...defaultUiSettings.viewportToolbar,
      ...(this.config?.viewportToolbar ?? {}),
    };
  }

  _getCamCfg() {
    return {
      ...defaultUiSettings.cameraOptions,
      ...(this.config?.cameraOptions ?? {}),
    };
  }

  _toggleMenu(id) {
    const next = this._openMenu === id ? null : id;
    this._openMenu = next;
    for (const [key, menuEl] of this._menus.entries()) {
      menuEl.style.display = key === next ? '' : 'none';
    }
  }

  _closeMenus() {
    this._openMenu = null;
    for (const menuEl of this._menus.values()) {
      menuEl.style.display = 'none';
    }
  }

  _makePillButton(label, title = '', isDropdown = false) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = isDropdown
      ? 'hud-vtb__pill hud-vtb__pill--dropdown'
      : 'hud-vtb__pill';
    if (isDropdown) {
      btn.innerHTML = `<span class="hud-vtb__caret">▾</span><span class="hud-vtb__pill-text">${label}</span>`;
    } else {
      btn.textContent = label;
    }
    if (title) btn.title = title;
    return btn;
  }

  _setDropdownText(btn, text) {
    if (!btn) return;
    const textEl = btn.querySelector('.hud-vtb__pill-text');
    if (textEl) {
      textEl.textContent = text;
    } else {
      btn.textContent = text;
    }
  }

  _setAdaptiveButtonWidth(btn, candidateLabels, isDropdown = false) {
    if (!btn || !Array.isArray(candidateLabels) || candidateLabels.length === 0) return;
    const host = this.el.parentElement ?? document.body;
    const probe = document.createElement('span');
    probe.className = btn.className;
    probe.style.position = 'fixed';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.width = 'auto';
    probe.style.minWidth = '0';
    probe.style.maxWidth = 'none';
    host.appendChild(probe);

    const rectProbe = probe.getBoundingClientRect();
    const scaleFactor = probe.offsetWidth > 0 && rectProbe.width > 0
      ? rectProbe.width / probe.offsetWidth
      : 1;

    let maxWidth = 0;
    for (const text of candidateLabels) {
      if (isDropdown) {
        probe.innerHTML = `<span class="hud-vtb__caret">▾</span><span class="hud-vtb__pill-text">${text}</span>`;
      } else {
        probe.textContent = text;
      }
      const w = Math.ceil(probe.getBoundingClientRect().width / scaleFactor);
      if (w > maxWidth) maxWidth = w;
    }
    probe.remove();

    if (maxWidth > 0) {
      btn.style.width = `${maxWidth}px`;
      btn.style.minWidth = `${maxWidth}px`;
    }
  }

  _buildUI() {
    const tbCfg = this._getToolbarCfg();
    const camCfg = this._getCamCfg();

    // 1. FILE DROPDOWN
    const fileWrap = document.createElement('div');
    fileWrap.className = 'hud-vtb__dropdown';
    const fileBtn = this._makePillButton('File', 'Scene File Actions', true);
    fileBtn.addEventListener('click', () => this._toggleMenu('file'));

    const fileMenu = document.createElement('div');
    fileMenu.className = 'hud-vtb__menu';
    fileMenu.style.display = 'none';
    for (const item of tbCfg.fileItems ?? []) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'hud-vtb__menu-item';
      const sc = item.shortcut ? `<span class="hud-vtb__shortcut">${item.shortcut}</span>` : '';
      row.innerHTML = `<span>${item.label}</span>${sc}`;
      row.addEventListener('click', () => {
        this._closeMenus();
        this.eventBus.emit('input:action:down', { action: item.action });
      });
      fileMenu.appendChild(row);
    }
    this._menus.set('file', fileMenu);
    fileWrap.append(fileBtn, fileMenu);

    // 2. GIZMO SEGMENTED GROUP (None, Location, Rotation, Scale)
    // 2. GIZMO SEGMENTED GROUP (None, Location, Rotation, Scale)
    const gizmoGroup = document.createElement('div');
    gizmoGroup.className = 'hud-vtb__segment';
    for (const gm of tbCfg.gizmoModes ?? []) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hud-vtb__seg-btn';
      const sc = gm.shortcut ? `<span class="hud-vtb__shortcut">${gm.shortcut}</span>` : '';
      btn.innerHTML = `<span>${gm.label}</span>${sc}`;
      btn.title = gm.title ?? gm.label;
      btn.addEventListener('click', () => {
        this.eventBus.emit('gizmo:setMode', { mode: gm.id });
      });
      this._gizmoBtns.set(gm.id, btn);
      gizmoGroup.appendChild(btn);
    }

    // 3. COORDINATE SPACE TOGGLE (Global / Local — tanpa highlight)
    this._spaceBtn = this._makePillButton('Global', 'Toggle Global / Local Coordinate Space', false);
    this._spaceBtn.addEventListener('click', () => {
      this.eventBus.emit('gizmo:toggleSpace');
    });

    // 4. CAMERA DROPDOWN (Projection, Near Plane, Far Plane)
    const camWrap = document.createElement('div');
    camWrap.className = 'hud-vtb__dropdown';
    this._cameraDropBtn = this._makePillButton('Perspective', 'Camera Projection & Clipping', true);
    this._cameraDropBtn.addEventListener('click', () => this._toggleMenu('camera'));

    const camMenu = document.createElement('div');
    camMenu.className = 'hud-vtb__menu hud-vtb__menu--form';
    camMenu.style.display = 'none';

    const projRow = document.createElement('div');
    projRow.className = 'hud-vtb__form-row';
    const projLabel = document.createElement('span');
    projLabel.textContent = 'Projection';
    const projToggle = document.createElement('button');
    projToggle.type = 'button';
    projToggle.className = 'hud-vtb__inline-toggle';
    projToggle.addEventListener('click', () => {
      const next = this._projection === 'perspective' ? 'orthographic' : 'perspective';
      this.eventBus.emit('camera:setProjection', { projection: next });
    });
    this._projToggleBtn = projToggle;
    projRow.append(projLabel, projToggle);

    const nearRow = document.createElement('div');
    nearRow.className = 'hud-vtb__form-row';
    const nearLabel = document.createElement('span');
    nearLabel.textContent = 'Near Plane';
    const nearInput = document.createElement('input');
    nearInput.type = 'number';
    nearInput.className = 'hud-vtb__num-input';
    nearInput.step = '0.01';
    nearInput.value = String(this._near);
    nearInput.addEventListener('change', () => {
      const def = Number(camCfg.defaultNear ?? 0.05);
      const min = Number(camCfg.minNear ?? 0.001);
      const max = Number(camCfg.maxNear ?? 50);
      const raw = nearInput.value.trim();
      const parsed = raw === '' ? def : Number(raw);
      const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : def;
      nearInput.value = String(next);
      this.eventBus.emit('camera:updateLens', { near: next });
    });
    this._nearInput = nearInput;
    nearRow.append(nearLabel, nearInput);

    const farRow = document.createElement('div');
    farRow.className = 'hud-vtb__form-row';
    const farLabel = document.createElement('span');
    farLabel.textContent = 'Far Plane';
    const farInput = document.createElement('input');
    farInput.type = 'number';
    farInput.className = 'hud-vtb__num-input';
    farInput.step = '10';
    farInput.value = String(this._far);
    farInput.addEventListener('change', () => {
      const def = Number(camCfg.defaultFar ?? 2000);
      const min = Number(camCfg.minFar ?? 50);
      const max = Number(camCfg.maxFar ?? 100000);
      const raw = farInput.value.trim();
      const parsed = raw === '' ? def : Number(raw);
      const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : def;
      farInput.value = String(next);
      this.eventBus.emit('camera:updateLens', { far: next });
    });
    this._farInput = farInput;
    farRow.append(farLabel, farInput);

    camMenu.append(projRow, nearRow, farRow);
    this._menus.set('camera', camMenu);
    camWrap.append(this._cameraDropBtn, camMenu);

    // 5. CONTROLLER MODE DROPDOWN
    const ctrlWrap = document.createElement('div');
    ctrlWrap.className = 'hud-vtb__dropdown';
    this._controllerDropBtn = this._makePillButton('Surveyor', 'Controller Mode', true);
    this._controllerDropBtn.addEventListener('click', () => this._toggleMenu('controller'));

    const ctrlMenu = document.createElement('div');
    ctrlMenu.className = 'hud-vtb__menu';
    ctrlMenu.style.display = 'none';
    this._ctrlMenuItems = new Map();
    for (const cm of tbCfg.controllerModes ?? []) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'hud-vtb__menu-item';
      const sc = cm.shortcut ? `<span class="hud-vtb__shortcut">${cm.shortcut}</span>` : '';
      row.innerHTML = `<span>${cm.label}</span>${sc}`;
      row.addEventListener('click', () => {
        this._closeMenus();
        this.eventBus.emit('pawn:setMode', { mode: cm.id });
      });
      this._ctrlMenuItems.set(cm.id, row);
      ctrlMenu.appendChild(row);
    }
    this._menus.set('controller', ctrlMenu);
    ctrlWrap.append(this._controllerDropBtn, ctrlMenu);

    // 6. VIEW MODE DROPDOWN
    const viewWrap = document.createElement('div');
    viewWrap.className = 'hud-vtb__dropdown';
    this._viewDropBtn = this._makePillButton('Lit', 'Viewport Shading View Mode', true);
    this._viewDropBtn.addEventListener('click', () => this._toggleMenu('view'));

    const viewMenu = document.createElement('div');
    viewMenu.className = 'hud-vtb__menu';
    viewMenu.style.display = 'none';
    this._viewMenuItems = new Map();
    for (const vm of tbCfg.viewModes ?? []) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'hud-vtb__menu-item';
      row.innerHTML = `<span>${vm.label}</span><span class="hud-vtb__shortcut">${vm.shortcut}</span>`;
      row.addEventListener('click', () => {
        this._closeMenus();
        this.eventBus.emit('view:setMode', { mode: vm.mode });
      });
      this._viewMenuItems.set(vm.mode, row);
      viewMenu.appendChild(row);
    }
    this._menus.set('view', viewMenu);
    viewWrap.append(this._viewDropBtn, viewMenu);

    this.el.append(fileWrap, gizmoGroup, this._spaceBtn, camWrap, ctrlWrap, viewWrap);

    this.syncAdaptiveWidths();
    this._syncState();
  }

  syncAdaptiveWidths() {
    const tbCfg = this._getToolbarCfg();
    this._setAdaptiveButtonWidth(this._spaceBtn, ['Global', 'Local'], false);
    this._setAdaptiveButtonWidth(this._cameraDropBtn, ['Perspective', 'Orthogonal'], true);
    this._setAdaptiveButtonWidth(this._projToggleBtn, ['Perspective', 'Orthogonal'], false);
    this._setAdaptiveButtonWidth(
      this._controllerDropBtn,
      (tbCfg.controllerModes ?? []).map((c) => c.label),
      true
    );
    this._setAdaptiveButtonWidth(
      this._viewDropBtn,
      (tbCfg.viewModes ?? []).map((v) => v.label),
      true
    );

    // Samakan lebar minimum popup dropdown dengan list item terpanjangnya (seperti tombol dropdown)
    for (const menuEl of this._menus.values()) {
      menuEl.style.minWidth = '';
    }
  }

  _syncState() {
    const tbCfg = this._getToolbarCfg();

    for (const [id, btn] of this._gizmoBtns.entries()) {
      btn.classList.toggle('is-active', id === this._gizmoMode);
    }

    if (this._spaceBtn) {
      this._spaceBtn.textContent = this._gizmoSpace === 'local' ? 'Local' : 'Global';
      this._spaceBtn.classList.remove('is-active');
    }

    const projTitle = this._projection === 'orthographic' ? 'Orthogonal' : 'Perspective';
    if (this._cameraDropBtn) {
      this._setDropdownText(this._cameraDropBtn, projTitle);
      this._cameraDropBtn.classList.remove('is-active');
    }
    if (this._projToggleBtn) {
      this._projToggleBtn.textContent = projTitle;
      this._projToggleBtn.classList.remove('is-active');
    }

    if (this._nearInput && document.activeElement !== this._nearInput) {
      this._nearInput.value = String(this._near);
    }
    if (this._farInput && document.activeElement !== this._farInput) {
      this._farInput.value = String(this._far);
    }

    const activeCtrl = (tbCfg.controllerModes ?? []).find((c) => c.id === this._controllerMode);
    if (this._controllerDropBtn) {
      this._setDropdownText(this._controllerDropBtn, activeCtrl?.label ?? 'Surveyor');
    }
    for (const [id, row] of this._ctrlMenuItems?.entries() ?? []) {
      row.classList.toggle('is-active', id === this._controllerMode);
    }

    const activeView = (tbCfg.viewModes ?? []).find((v) => v.mode === this._viewMode);
    if (this._viewDropBtn) {
      this._setDropdownText(this._viewDropBtn, activeView?.label ?? 'Lit');
    }
    for (const [mode, row] of this._viewMenuItems?.entries() ?? []) {
      row.classList.toggle('is-active', mode === this._viewMode);
    }
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    this.el.style.display = this.visible ? 'flex' : 'none';
    if (!this.visible) this._closeMenus();
  }

  mount(parent) {
    parent.appendChild(this.el);
    this.syncAdaptiveWidths();
  }

  dispose() {
    document.removeEventListener('pointerdown', this._onDocPointerDown);
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
    this.el.remove();
  }
}
