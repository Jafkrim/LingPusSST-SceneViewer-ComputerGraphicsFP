import defaultUiSettings from '@/config/uiSettings.json';
import { ThemeManager } from './themes/themeManager.js';
import { SettingsPanel } from './panels/settingsPanel.js';
import { StatsPanel } from './panels/statsPanel.js';
import { ContentBrowserPanel } from './panels/contentBrowserPanel.js';

function normalizeUiScale(rawScale, baseScale = defaultUiSettings.uiScale) {
  const min = typeof rawScale?.min === 'number' ? rawScale.min : baseScale.min;
  const max = typeof rawScale?.max === 'number' ? rawScale.max : baseScale.max;
  const val =
    typeof rawScale === 'number'
      ? rawScale
      : typeof rawScale?.value === 'number'
        ? rawScale.value
        : baseScale.value;

  return {
    value: Math.min(max, Math.max(min, Math.round(val))),
    min,
    max,
  };
}

function mergeUiConfig(base, override) {
  const safe = override && typeof override === 'object' ? override : {};
  return {
    ...base,
    ...safe,
    uiScale: normalizeUiScale(safe.uiScale, base.uiScale),
    panels: {
      ...base.panels,
      ...(safe.panels && typeof safe.panels === 'object' ? safe.panels : {}),
    },
    contentBrowser: {
      ...base.contentBrowser,
      ...(safe.contentBrowser && typeof safe.contentBrowser === 'object' ? safe.contentBrowser : {}),
    },
  };
}

export class UIManager {
  constructor({ root, eventBus, renderPipeline, assetResolver, config = {} }) {
    if (!root || !eventBus) {
      throw new Error('UIManager requires root and eventBus.');
    }

    this.root = root;
    this.eventBus = eventBus;
    this.renderPipeline = renderPipeline;
    this.assetResolver = assetResolver ?? null;

    this.uiConfig = mergeUiConfig(structuredClone(defaultUiSettings), config.ui ?? {});
    this.viewMode = this.uiConfig.viewMode;
    this.hudHidden = Boolean(this.uiConfig.hudHidden);

    this.actions = {
      toggleHud: 'ui.toggleHud',
      toggleSettings: 'ui.toggleSettings',
      toggleStats: 'ui.toggleStats',
      toggleContentBrowser: 'ui.toggleContentBrowser',
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

    this.contentBrowserPanel = new ContentBrowserPanel({
      eventBus: this.eventBus,
      assetResolver: this.assetResolver,
      config: this.uiConfig,
    });
    this.contentBrowserPanel.mount(this.container);

    this._applyUiScale(this.uiConfig.uiScale.value / 100);
    this._applyHudVisibility();

    this._unsubs = [
      this.eventBus.on('config:loaded', ({ fileName, data } = {}) => {
        if (fileName === 'uiSettings.json' && data) {
          this._applyUiConfig(data);
        }
      }),
      this.eventBus.on('input:action:down', ({ action } = {}) => {
        if (action === this.actions.toggleHud) {
          this.toggleHud();
        } else if (action === this.actions.toggleSettings) {
          this.settingsPanel.toggle();
          this.uiConfig.panels.settingsVisible = this.settingsPanel.visible;
          this._emitSave();
        } else if (action === this.actions.toggleStats) {
          this.statsPanel.toggle();
          this.uiConfig.panels.statsVisible = this.statsPanel.visible;
          this._emitSave();
        } else if (action === this.actions.toggleContentBrowser) {
          this.contentBrowserPanel.toggle();
          this.uiConfig.panels.contentBrowserVisible = this.contentBrowserPanel.visible;
          this._emitSave();
        }
      }),
      this.eventBus.on('ui:closeContentBrowser', () => {
        if (this.contentBrowserPanel.visible) {
          this.contentBrowserPanel.setVisible(false);
          this.uiConfig.panels.contentBrowserVisible = false;
          this._emitSave();
        }
      }),
      this.eventBus.on('ui:contentBrowserChanged', (patch = {}) => {
        this.uiConfig.contentBrowser = {
          ...this.uiConfig.contentBrowser,
          ...patch,
        };
        this._emitSave();
      }),
      this.eventBus.on('theme:applied', (payload = {}) => {
        const nextTheme = payload.themeId ?? payload.id ?? this.themeManager?.activeThemeId;
        if (typeof nextTheme === 'string' && nextTheme.length > 0 && this.uiConfig.theme !== nextTheme) {
          this.uiConfig.theme = nextTheme;
          this._emitSave();
        }
      }),
      this.eventBus.on('ui:scaleChanged', ({ percent, scale } = {}) => {
        if (typeof scale === 'number' && !Number.isNaN(scale)) {
          const rawPercent =
            typeof percent === 'number' && !Number.isNaN(percent)
              ? percent
              : Math.round(scale * 100);
          const clamped = Math.min(
            this.uiConfig.uiScale.max,
            Math.max(this.uiConfig.uiScale.min, Math.round(rawPercent))
          );

          this._applyUiScale(clamped / 100);
          if (this.uiConfig.uiScale.value !== clamped) {
            this.uiConfig.uiScale.value = clamped;
            this._emitSave();
          }
        }
      }),
      this.eventBus.on('view:setMode', ({ mode } = {}) => {
        if (typeof mode === 'number' && this.viewMode !== mode) {
          this.viewMode = mode;
          this.uiConfig.viewMode = mode;
          this._emitSave();
        }
      }),
    ];
  }

  _applyUiConfig(incoming) {
    const merged = mergeUiConfig(this.uiConfig, incoming);
    this.uiConfig = merged;
    this.viewMode = merged.viewMode;
    this.hudHidden = Boolean(merged.hudHidden);

    if (merged.theme && this.themeManager?.activeThemeId !== merged.theme) {
      this.themeManager?.setTheme?.(merged.theme);
    }
    this.settingsPanel?.setVisible?.(Boolean(merged.panels?.settingsVisible));
    this.statsPanel?.setVisible?.(Boolean(merged.panels?.statsVisible));
    this.contentBrowserPanel?.setVisible?.(Boolean(merged.panels?.contentBrowserVisible));
    this.contentBrowserPanel?.applyConfig?.(merged.contentBrowser);
    this.settingsPanel?.setUiScale?.(merged.uiScale.value);
    this._applyUiScale(merged.uiScale.value / 100);
    this._applyHudVisibility();
  }

  _emitSave() {
    this.eventBus.emit('config:save', {
      fileName: 'uiSettings.json',
      data: {
        storageKey: this.uiConfig.storageKey,
        theme: this.uiConfig.theme,
        viewMode: this.viewMode,
        hudHidden: this.hudHidden,
        uiScale: { ...this.uiConfig.uiScale },
        panels: { ...this.uiConfig.panels },
        contentBrowser: {
          ...this.uiConfig.contentBrowser,
          scopes: [...(this.uiConfig.contentBrowser?.scopes ?? [])],
          categories: [...(this.uiConfig.contentBrowser?.categories ?? [])],
          expandedNodes: [...(this.uiConfig.contentBrowser?.expandedNodes ?? [])],
        },
      },
    });
  }

  _applyUiScale(scale) {
    document.documentElement.style.setProperty('--ui-scale', String(scale));
  }

  _applyHudVisibility() {
    this.container.style.display = this.hudHidden ? 'none' : '';
    this.eventBus.emit('ui:hudVisibilityChanged', { hidden: this.hudHidden });
  }

  toggleHud() {
    this.hudHidden = !this.hudHidden;
    this.uiConfig.hudHidden = this.hudHidden;
    this._applyHudVisibility();
    this._emitSave();
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
    this.contentBrowserPanel.dispose();
    this.container.remove();
  }
}
