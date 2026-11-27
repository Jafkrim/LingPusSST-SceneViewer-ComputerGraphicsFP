import defaultUiSettings from '@/config/uiSettings.json';

export class SettingsPanel {
  constructor({ eventBus, themeManager, config = defaultUiSettings }) {
    this.eventBus = eventBus;
    this.themeManager = themeManager;
    this.config = config;
    this.visible = Boolean(this.config.panels?.settingsVisible);

    const panelCfg = {
      ...defaultUiSettings.settingsPanel,
      ...(this.config.settingsPanel ?? {}),
    };

    this.backdropEl = document.createElement('div');
    this.backdropEl.className = 'hud-settings-backdrop';
    this.backdropEl.setAttribute('data-ui-interactive', 'true');
    this.backdropEl.style.display = 'none';

    this.el = document.createElement('aside');
    this.el.className = 'hud-panel hud-settings hud-settings--modal';
    this.el.setAttribute('data-ui-interactive', 'true');
    this.el.style.display = 'none';
    this._applyModalMetrics(panelCfg);

    // Header with top-left Close button
    const header = document.createElement('div');
    header.className = 'hud-panel__header hud-settings__header';

    this.closeBtn = document.createElement('button');
    this.closeBtn.type = 'button';
    this.closeBtn.className = 'hud-settings__close';
    this.closeBtn.title = panelCfg.closeTitle;
    this.closeBtn.setAttribute('aria-label', panelCfg.closeTitle);
    this.closeBtn.textContent = panelCfg.closeLabel;
    this.closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.eventBus.emit('ui:closeSettings');
    });

    this.titleEl = document.createElement('span');
    this.titleEl.className = 'hud-panel__title';
    this.titleEl.textContent = panelCfg.title;

    header.append(this.closeBtn, this.titleEl);

    // Theme row
    const themeRow = document.createElement('div');
    themeRow.className = 'hud-field';

    const themeLabel = document.createElement('label');
    themeLabel.className = 'hud-field__label';
    themeLabel.textContent = 'Theme';
    themeLabel.htmlFor = 'hud-theme-select';

    this.themeSelect = document.createElement('select');
    this.themeSelect.id = 'hud-theme-select';
    this.themeSelect.className = 'hud-select';
    this._rebuildThemeOptions();

    this.themeSelect.addEventListener('change', () => {
      this.themeManager.setTheme(this.themeSelect.value);
    });

    themeRow.append(themeLabel, this.themeSelect);

    // UI Scale row (pointer-captured slider)
    const scaleRow = document.createElement('div');
    scaleRow.className = 'hud-field';

    const scaleHeader = document.createElement('div');
    scaleHeader.className = 'hud-field__row';

    const scaleLabel = document.createElement('span');
    scaleLabel.className = 'hud-field__label';
    scaleLabel.textContent = 'UI Scale';

    this.scaleValue = document.createElement('span');
    this.scaleValue.className = 'hud-field__value';

    scaleHeader.append(scaleLabel, this.scaleValue);

    const scaleBounds = {
      ...defaultUiSettings.uiScale,
      ...(this.config.uiScale ?? {}),
    };
    this._scaleMin = Number(scaleBounds.min);
    this._scaleMax = Number(scaleBounds.max);
    this._scaleStep = Number(scaleBounds.step ?? 5);
    this._scaleCurrent = Number(scaleBounds.value);

    this.sliderTrack = document.createElement('div');
    this.sliderTrack.className = 'hud-slider';
    this.sliderTrack.setAttribute('role', 'slider');
    this.sliderTrack.tabIndex = 0;
    this.sliderTrack.setAttribute('aria-label', 'UI Scale');
    this.sliderTrack.setAttribute('aria-valuemin', String(this._scaleMin));
    this.sliderTrack.setAttribute('aria-valuemax', String(this._scaleMax));

    this.sliderFill = document.createElement('div');
    this.sliderFill.className = 'hud-slider__fill';

    this.sliderThumb = document.createElement('div');
    this.sliderThumb.className = 'hud-slider__thumb';

    this.sliderTrack.append(this.sliderFill, this.sliderThumb);
    this._renderSlider(this._scaleCurrent);

    let dragRect = null;
    const applyClientX = (clientX) => {
      if (!dragRect || dragRect.width <= 0) return;
      const ratio = Math.min(1, Math.max(0, (clientX - dragRect.left) / dragRect.width));
      const raw = this._scaleMin + ratio * (this._scaleMax - this._scaleMin);
      const stepped = Math.round(raw / this._scaleStep) * this._scaleStep;
      const clamped = Math.min(this._scaleMax, Math.max(this._scaleMin, stepped));
      if (clamped !== this._scaleCurrent) {
        this._renderSlider(clamped);
        this.eventBus.emit('ui:scaleChanged', { percent: clamped, scale: clamped / 100 });
      }
    };

    this.sliderTrack.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragRect = this.sliderTrack.getBoundingClientRect();
      this.sliderTrack.setPointerCapture(e.pointerId);
      applyClientX(e.clientX);
    });

    this.sliderTrack.addEventListener('pointermove', (e) => {
      if (dragRect && this.sliderTrack.hasPointerCapture(e.pointerId)) {
        applyClientX(e.clientX);
      }
    });

    const endDrag = (e) => {
      if (dragRect) {
        dragRect = null;
        if (this.sliderTrack.hasPointerCapture?.(e.pointerId)) {
          this.sliderTrack.releasePointerCapture(e.pointerId);
        }
      }
    };
    this.sliderTrack.addEventListener('pointerup', endDrag);
    this.sliderTrack.addEventListener('pointercancel', endDrag);

    this.sliderTrack.addEventListener('keydown', (e) => {
      let delta = 0;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = this._scaleStep;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -this._scaleStep;
      if (delta !== 0) {
        e.preventDefault();
        const next = Math.min(this._scaleMax, Math.max(this._scaleMin, this._scaleCurrent + delta));
        this._renderSlider(next);
        this.eventBus.emit('ui:scaleChanged', { percent: next, scale: next / 100 });
      }
    });

    scaleRow.append(scaleHeader, this.sliderTrack);

    const body = document.createElement('div');
    body.className = 'hud-panel__body hud-settings__body';
    body.append(themeRow, scaleRow);

    this.el.append(header, body);
    this.backdropEl.appendChild(this.el);

    this.backdropEl.addEventListener('pointerdown', (e) => {
      if (e.target === this.backdropEl) {
        this.eventBus.emit('ui:closeSettings');
      }
    });

    this._onWindowKeyDown = (e) => {
      if (!this.visible) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.eventBus.emit('ui:closeSettings');
      }
    };
    window.addEventListener('keydown', this._onWindowKeyDown, true);

    this._unsubThemeApplied = this.eventBus.on('theme:applied', (payload = {}) => {
      const nextId = payload.id ?? payload.themeId ?? this.themeManager.activeThemeId;
      if (nextId && this.themeSelect.value !== nextId) {
        this.themeSelect.value = nextId;
      }
    });

    this._unsubThemeInstalled = this.eventBus.on('theme:installed', () => {
      this._rebuildThemeOptions();
    });
  }

  _applyModalMetrics(panelCfg) {
    this.el.style.setProperty('--settings-width', `${Number(panelCfg.widthPx ?? 560)}px`);
    this.el.style.setProperty('--settings-min-height', `${Number(panelCfg.minHeightPx ?? 360)}px`);
    this.el.style.setProperty('--settings-max-height', `${Number(panelCfg.maxHeightVh ?? 85)}vh`);
  }

  _rebuildThemeOptions() {
    const activeId = this.themeManager.activeThemeId;
    this.themeSelect.innerHTML = '';
    for (const theme of this.themeManager.listThemes()) {
      const opt = document.createElement('option');
      opt.value = theme.id;
      opt.textContent = theme.name ?? theme.id;
      this.themeSelect.appendChild(opt);
    }
    if (activeId) {
      this.themeSelect.value = activeId;
    }
  }

  applyConfig(nextConfig) {
    this.config = nextConfig;
    const panelCfg = {
      ...defaultUiSettings.settingsPanel,
      ...(this.config.settingsPanel ?? {}),
    };
    this._applyModalMetrics(panelCfg);
    this.titleEl.textContent = panelCfg.title;
    this.closeBtn.textContent = panelCfg.closeLabel;
    this.closeBtn.title = panelCfg.closeTitle;
    this.closeBtn.setAttribute('aria-label', panelCfg.closeTitle);

    const scaleBounds = {
      ...defaultUiSettings.uiScale,
      ...(this.config.uiScale ?? {}),
    };
    this._scaleMin = Number(scaleBounds.min);
    this._scaleMax = Number(scaleBounds.max);
    this._scaleStep = Number(scaleBounds.step ?? 5);
    this.sliderTrack.setAttribute('aria-valuemin', String(this._scaleMin));
    this.sliderTrack.setAttribute('aria-valuemax', String(this._scaleMax));
    this._renderSlider(scaleBounds.value);
    this._rebuildThemeOptions();
  }

  _renderSlider(percent) {
    this._scaleCurrent = Math.round(percent);
    const pctRatio =
      ((this._scaleCurrent - this._scaleMin) / Math.max(1, this._scaleMax - this._scaleMin)) * 100;
    this.scaleValue.textContent = `${this._scaleCurrent}%`;
    this.sliderTrack.setAttribute('aria-valuenow', String(this._scaleCurrent));
    this.sliderFill.style.width = `${pctRatio}%`;
    this.sliderThumb.style.left = `${pctRatio}%`;
  }

  mount(parent) {
    parent.appendChild(this.backdropEl);
    this.setVisible(this.visible);
  }

  setVisible(next) {
    this.visible = Boolean(next);
    this.backdropEl.style.display = this.visible ? 'flex' : 'none';
    this.el.style.display = this.visible ? 'flex' : 'none';
  }

  toggle() {
    this.setVisible(!this.visible);
  }

  setUiScale(percent) {
    this._renderSlider(percent);
  }

  dispose() {
    window.removeEventListener('keydown', this._onWindowKeyDown, true);
    this._unsubThemeApplied?.();
    this._unsubThemeInstalled?.();
    this.backdropEl.remove();
  }
}
