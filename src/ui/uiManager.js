import defaultUiSettings from '@/config/uiSettings.json';
import { ThemeManager } from './themes/themeManager.js';
import { SettingsPanel } from './panels/settingsPanel.js';
import { StatsPanel } from './panels/statsPanel.js';

function mergeUiConfig(base, override) {
  const safe = override && typeof override === 'object' ? override : {};
  return {
    ...base,
    ...safe,
    fontScale: {
      ...base.fontScale,
      ...(safe.fontScale && typeof safe.fontScale === 'object' ? safe.fontScale : {}),
    },
    panels: {
      ...base.panels,
      ...(safe.panels && typeof safe.panels === 'object' ? safe.panels : {}),
    },
  };
}

function loadJsonFromStorage(storageKey, fallback) {
  if (!storageKey || typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    return mergeUiConfig(fallback, JSON.parse(raw));
  } catch {
    return fallback;
  }
}

function saveJsonToStorage(storageKey, data) {
  if (!storageKey || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(data, null, 2));
  } catch {
    // Ignore storage quota or restricted context errors
  }
}

export class UIManager {
  constructor({ root, eventBus, renderPipeline, config = {} }) {
    if (!root || !eventBus) {
      throw new Error('UIManager requires root and eventBus.');
    }

    this.root = root;
    this.eventBus = eventBus;
    this.renderPipeline = renderPipeline;

    const baseDefaults = mergeUiConfig(
      { hudHidden: false, ...defaultUiSettings },
      config.ui ?? {}
    );

    this.uiConfig = loadJsonFromStorage(baseDefaults.storageKey, baseDefaults);
    this.viewMode = this.uiConfig.viewMode;
    this.hudHidden = Boolean(this.uiConfig.hudHidden);

    this.actions = {
      toggleHud: 'ui.toggleHud',
      toggleSettings: 'ui.toggleSettings',
      toggleStats: 'ui.toggleStats',
      ...(config.actions ?? {}),
    };

    this.themeManager = new ThemeManager({
      eventBus: this.eventBus,
      initialThemeId: config.initialThemeId ?? this.uiConfig.theme,
    });

    this.container = document.createElement('div');
    this.container.className = 'hud-overlay';
    this.root.appendChild(this.container);

    this.settingsPanel = new SettingsPanel({
      eventBus: this.eventBus,
      themeManager: this.themeManager,
      config: this.uiConfig,
    });
    this.settingsPanel.mount(this.container);

    this.statsPanel = new StatsPanel({
      eventBus: this.eventBus,
      renderPipeline: this.renderPipeline,
      config: this.uiConfig,
    });
    this.statsPanel.mount(this.container);

    this._applyFontScale((this.uiConfig.fontScale?.default ?? 100) / 100);
    this._applyHudVisibility();
    this._savePrefs();

    this._unsubs = [
      this.eventBus.on('input:action:down', ({ action } = {}) => {
        if (action === this.actions.toggleHud) {
          this.toggleHud();
        } else if (action === this.actions.toggleSettings) {
          this.settingsPanel.toggle();
          this.uiConfig.panels.settingsVisible = this.settingsPanel.visible;
          this._savePrefs();
        } else if (action === this.actions.toggleStats) {
          this.statsPanel.toggle();
          this.uiConfig.panels.statsVisible = this.statsPanel.visible;
          this._savePrefs();
        }
      }),
      this.eventBus.on('theme:applied', (payload = {}) => {
        const nextTheme = payload.themeId ?? payload.id ?? this.themeManager?.activeThemeId;
        if (typeof nextTheme === 'string' && nextTheme.length > 0) {
          this.uiConfig.theme = nextTheme;
          this._savePrefs();
        }
      }),
      this.eventBus.on('ui:fontScaleChanged', ({ percent, scale } = {}) => {
        if (typeof scale === 'number' && !Number.isNaN(scale)) {
          this._applyFontScale(scale);
          this.uiConfig.fontScale.default =
            typeof percent === 'number' && !Number.isNaN(percent)
              ? percent
              : Math.round(scale * 100);
          this._savePrefs();
        }
      }),
      this.eventBus.on('view:setMode', ({ mode } = {}) => {
        if (typeof mode === 'number') {
          this.viewMode = mode;
          this.uiConfig.viewMode = mode;
          this._savePrefs();
        }
      }),
    ];
  }

  getSettingsJson() {
    return JSON.stringify(
      {
        storageKey: this.uiConfig.storageKey,
        theme: this.uiConfig.theme,
        viewMode: this.viewMode,
        hudHidden: this.hudHidden,
        fontScale: { ...this.uiConfig.fontScale },
        panels: { ...this.uiConfig.panels },
      },
      null,
      2
    );
  }

  downloadSettingsJson(fileName = 'uiSettings.json') {
    const blob = new Blob([this.getSettingsJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  applySettingsJson(jsonText) {
    const parsed = JSON.parse(jsonText);
    const merged = mergeUiConfig(this.uiConfig, parsed);
    this.uiConfig = merged;
    this.viewMode = merged.viewMode;
    this.hudHidden = Boolean(merged.hudHidden);

    if (merged.theme && this.themeManager?.activeThemeId !== merged.theme) {
      this.themeManager?.setTheme?.(merged.theme);
    }
    this.settingsPanel?.setVisible?.(Boolean(merged.panels?.settingsVisible));
    this.statsPanel?.setVisible?.(Boolean(merged.panels?.statsVisible));
    this._applyFontScale((merged.fontScale?.default ?? 100) / 100);
    this._applyHudVisibility();
    this._savePrefs();
  }

  _savePrefs() {
    saveJsonToStorage(this.uiConfig.storageKey, {
      storageKey: this.uiConfig.storageKey,
      theme: this.uiConfig.theme,
      viewMode: this.viewMode,
      hudHidden: this.hudHidden,
      fontScale: { ...this.uiConfig.fontScale },
      panels: { ...this.uiConfig.panels },
    });
  }

  _applyFontScale(scale) {
    document.documentElement.style.setProperty('--ui-font-scale', String(scale));
  }

  _applyHudVisibility() {
    this.container.style.display = this.hudHidden ? 'none' : '';
    this.eventBus.emit('ui:hudVisibilityChanged', { hidden: this.hudHidden });
  }

  toggleHud() {
    this.hudHidden = !this.hudHidden;
    this.uiConfig.hudHidden = this.hudHidden;
    this._applyHudVisibility();
    this._savePrefs();
  }

  update(dt, ctx) {
    if (!this.hudHidden) {
      this.statsPanel.update(dt, ctx);
    }
  }

  dispose() {
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
    this.settingsPanel.dispose();
    this.statsPanel.dispose();
    this.container.remove();
  }
}
