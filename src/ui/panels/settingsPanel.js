import defaultUiSettings from '@/config/uiSettings.json';

function resolveScaleCfg(config) {
  const base = defaultUiSettings.uiScale;
  if (typeof config?.uiScale === 'number') {
    return { value: config.uiScale, min: base.min, max: base.max };
  }
  return {
    value: typeof config?.uiScale?.value === 'number' ? config.uiScale.value : base.value,
    min: typeof config?.uiScale?.min === 'number' ? config.uiScale.min : base.min,
    max: typeof config?.uiScale?.max === 'number' ? config.uiScale.max : base.max,
  };
}

export class SettingsPanel {
  constructor({ eventBus, themeManager, config = defaultUiSettings }) {
    this.eventBus = eventBus;
    this.themeManager = themeManager;
    this.config = config;
    this.visible = Boolean(this.config.panels?.settingsVisible);

    const scaleCfg = resolveScaleCfg(this.config);

    this.el = document.createElement('aside');
    this.el.className = 'hud-panel hud-settings';

    this.header = document.createElement('div');
    this.header.className = 'hud-panel__header';
    this.header.textContent = 'SETTINGS';

    this.body = document.createElement('div');
    this.body.className = 'hud-settings__body';

    const themeLabel = document.createElement('label');
    themeLabel.className = 'hud-panel__label';
    themeLabel.textContent = 'UI Theme';

    this._themeSelect = document.createElement('select');
    this._themeSelect.className = 'hud-panel__control';
    this._themeSelect.addEventListener('change', () => {
      this.themeManager?.setTheme?.(this._themeSelect.value);
    });

    const scaleLabel = document.createElement('label');
    scaleLabel.className = 'hud-panel__label';
    scaleLabel.textContent = 'UI Scale (%)';

    this._scaleInput = document.createElement('input');
    this._scaleInput.type = 'number';
    this._scaleInput.inputMode = 'decimal';
    this._scaleInput.min = String(scaleCfg.min);
    this._scaleInput.max = String(scaleCfg.max);
    this._scaleInput.className = 'hud-panel__control';
    this._scaleInput.value = String(scaleCfg.value);

    const commitScale = () => {
      const currentCfg = resolveScaleCfg(this.config);
      const raw = Number(this._scaleInput.value);
      const valid = Number.isFinite(raw) && raw > 0 ? raw : currentCfg.value;
      const clamped = Math.min(currentCfg.max, Math.max(currentCfg.min, Math.round(valid)));

      if (this.config.uiScale && typeof this.config.uiScale === 'object') {
        this.config.uiScale.value = clamped;
      } else {
        this.config.uiScale = { ...currentCfg, value: clamped };
      }

      this._scaleInput.value = String(clamped);
      this.eventBus?.emit?.('ui:scaleChanged', {
        percent: clamped,
        scale: clamped / 100,
      });
    };

    this._scaleInput.addEventListener('change', commitScale);
    this._scaleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._scaleInput.blur();
      }
    });

    this.body.append(themeLabel, this._themeSelect, scaleLabel, this._scaleInput);
    this.el.append(this.header, this.body);

    this._unsubs = [
      this.eventBus?.on?.('theme:installed', () => this._refreshThemeSelect()),
      this.eventBus?.on?.('theme:applied', () => this._refreshThemeSelect()),
    ].filter(Boolean);

    this._refreshThemeSelect();
  }

  _refreshThemeSelect() {
    if (!this._themeSelect || !this.themeManager) return;
    const themes = this.themeManager.listThemes();
    this._themeSelect.innerHTML = themes
      .map((t) => `<option value="${t.id}">${t.name}</option>`)
      .join('');
    if (this.themeManager.activeThemeId) {
      this._themeSelect.value = this.themeManager.activeThemeId;
    }
  }

  setUiScale(percent) {
    const currentCfg = resolveScaleCfg(this.config);
    if (typeof percent !== 'number' || !Number.isFinite(percent)) return;
    const clamped = Math.min(currentCfg.max, Math.max(currentCfg.min, Math.round(percent)));
    if (this.config.uiScale && typeof this.config.uiScale === 'object') {
      this.config.uiScale.value = clamped;
    } else {
      this.config.uiScale = { ...currentCfg, value: clamped };
    }
    if (this._scaleInput) {
      this._scaleInput.value = String(clamped);
    }
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

  dispose() {
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
    this.el.remove();
  }
}
