import defaultUiSettings from '@/config/uiSettings.json';

export class SettingsPanel {
  constructor({ eventBus, themeManager, config = defaultUiSettings }) {
    this.eventBus = eventBus;
    this.themeManager = themeManager;
    this.config = config;
    this.visible = Boolean(this.config.panels?.settingsVisible);

    const fontCfg = this.config.fontScale;

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
    scaleLabel.textContent = 'UI Font Scale (%)';

    this._scaleInput = document.createElement('input');
    this._scaleInput.type = 'number';
    this._scaleInput.className = 'hud-panel__control';
    if (typeof fontCfg.min === 'number') this._scaleInput.min = String(fontCfg.min);
    if (typeof fontCfg.max === 'number') this._scaleInput.max = String(fontCfg.max);
    if (typeof fontCfg.step === 'number') this._scaleInput.step = String(fontCfg.step);
    this._scaleInput.value = String(fontCfg.default);

    this._scaleInput.addEventListener('change', () => {
      const raw = Number(this._scaleInput.value);
      let next = Number.isFinite(raw) && raw > 0 ? raw : fontCfg.default;
      if (typeof fontCfg.min === 'number') next = Math.max(fontCfg.min, next);
      if (typeof fontCfg.max === 'number') next = Math.min(fontCfg.max, next);

      this._scaleInput.value = String(next);
      this.eventBus?.emit?.('ui:fontScaleChanged', {
        percent: next,
        scale: next / 100,
      });
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
