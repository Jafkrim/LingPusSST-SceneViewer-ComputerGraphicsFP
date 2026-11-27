import defaultUiSettings from '@/config/uiSettings.json';
import { ThemeManager } from './themes/themeManager.js';
import { SettingsPanel } from './panels/settingsPanel.js';
import { StatsPanel } from './panels/statsPanel.js';
import { ContentBrowserPanel } from './panels/contentBrowserPanel.js';
import { EditorPanel } from './panels/editorPanel.js';
import { ViewportGizmoPanel } from './panels/viewportGizmoPanel.js';
import { PieMenuPanel } from './panels/pieMenuPanel.js';

function normalizeUiScale(rawScale, baseScale = defaultUiSettings.uiScale) {
  const min = typeof rawScale?.min === 'number' ? rawScale.min : baseScale.min;
  const max = typeof rawScale?.max === 'number' ? rawScale.max : baseScale.max;
  const step = typeof rawScale?.step === 'number' ? rawScale.step : (baseScale.step ?? 5);
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
    step,
  };
}

function mergePieMenus(baseMenus = {}, overrideMenus = {}) {
  const merged = { ...baseMenus };
  for (const [menuId, def] of Object.entries(overrideMenus)) {
    merged[menuId] = {
      ...(baseMenus[menuId] ?? {}),
      ...def,
      items: Array.isArray(def?.items) ? def.items : (baseMenus[menuId]?.items ?? []),
    };
  }
  return merged;
}

function mergeUiConfig(base, override) {
  const safe = override && typeof override === 'object' ? override : {};
  const basePie = base.pieMenu ?? {};
  const safePie = safe.pieMenu && typeof safe.pieMenu === 'object' ? safe.pieMenu : {};

  return {
    ...base,
    ...safe,
    uiScale: normalizeUiScale(safe.uiScale, base.uiScale),
    animations: {
      ...base.animations,
      ...(safe.animations && typeof safe.animations === 'object' ? safe.animations : {}),
    },
    panels: {
      ...base.panels,
      ...(safe.panels && typeof safe.panels === 'object' ? safe.panels : {}),
    },
    settingsPanel: {
      ...base.settingsPanel,
      ...(safe.settingsPanel && typeof safe.settingsPanel === 'object' ? safe.settingsPanel : {}),
    },
    editorPanel: {
      ...base.editorPanel,
      ...(safe.editorPanel && typeof safe.editorPanel === 'object' ? safe.editorPanel : {}),
    },
    viewportGizmo: {
      ...base.viewportGizmo,
      ...(safe.viewportGizmo && typeof safe.viewportGizmo === 'object' ? safe.viewportGizmo : {}),
    },
    pieMenu: {
      ...basePie,
      ...safePie,
      menus: mergePieMenus(basePie.menus, safePie.menus),
    },
    viewportGuides: {
      ...base.viewportGuides,
      ...(safe.viewportGuides && typeof safe.viewportGuides === 'object' ? safe.viewportGuides : {}),
    },
    contentBrowser: {
      ...base.contentBrowser,
      ...(safe.contentBrowser && typeof safe.contentBrowser === 'object' ? safe.contentBrowser : {}),
    },
  };
}

function easeOutPanel(t) {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

export class UIManager {
  constructor({
    root,
    eventBus,
    renderPipeline,
    assetResolver,
    sceneManager = null,
    pawnManager = null,
    config = {},
  }) {
    if (!root || !eventBus) {
      throw new Error('UIManager requires root and eventBus.');
    }

    this.root = root;
    this.eventBus = eventBus;
    this.renderPipeline = renderPipeline;
    this.assetResolver = assetResolver ?? null;
    this.sceneManager = sceneManager;
    this.pawnManager = pawnManager;

    this.uiConfig = mergeUiConfig(structuredClone(defaultUiSettings), config.ui ?? {});
    this.viewMode = this.uiConfig.viewMode;
    this.hudHidden = Boolean(this.uiConfig.hudHidden);

    this.actions = {
      toggleHud: 'ui.toggleHud',
      toggleSettings: 'ui.toggleSettings',
      toggleContentBrowser: 'ui.toggleContentBrowser',
      toggleViewportGizmo: 'ui.toggleViewportGizmo',
      droneMode: 'camera.mode.drone',
      walkMode: 'camera.mode.walk',
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

    this.editorPanel = new EditorPanel({
      eventBus: this.eventBus,
      sceneManager: this.sceneManager,
      config: this.uiConfig,
    });
    this.editorPanel.mount(this.container);

    this.viewportGizmoPanel = new ViewportGizmoPanel({
      eventBus: this.eventBus,
      pawnManager: this.pawnManager,
      config: this.uiConfig,
    });
    this.viewportGizmoPanel.mount(this.container);

    this.pieMenuPanel = new PieMenuPanel({
      eventBus: this.eventBus,
      pawnManager: this.pawnManager,
      contentBrowserPanel: this.contentBrowserPanel,
      editorPanel: this.editorPanel,
      statsPanel: this.statsPanel,
      viewportGizmoPanel: this.viewportGizmoPanel,
      settingsPanel: this.settingsPanel,
      config: this.uiConfig,
    });
    this.pieMenuPanel.mount(this.container);

    this._panelRegistry = {
      settings: { panel: this.settingsPanel, key: 'settingsVisible', animType: 'fade' },
      stats: { panel: this.statsPanel, key: 'statsVisible', animType: 'fade' },
      contentBrowser: { panel: this.contentBrowserPanel, key: 'contentBrowserVisible', animType: 'slide' },
      editor: { panel: this.editorPanel, key: 'editorVisible', animType: 'slide' },
      viewportGizmo: { panel: this.viewportGizmoPanel, key: 'viewportGizmoVisible', animType: 'fade' },
    };

    this._panelAnimTimers = new Map();
    this._dockRaf = null;

    this._applyUiScale(this.uiConfig.uiScale.value / 100);
    this._applyAnimationsConfig(this.uiConfig.animations);
    this._syncDockOffsets(
      this.uiConfig.panels.editorVisible ? 1 : 0,
      this.uiConfig.panels.contentBrowserVisible ? 1 : 0
    );
    this._applyHudVisibility();

    this._unsubs = [
      this.eventBus.on('config:loaded', ({ fileName, data } = {}) => {
        if (fileName === 'uiSettings.json' && data) {
          this._applyUiConfig(data);
        }
      }),
      this.eventBus.on('input:action:down', ({ action } = {}) => {
        if (!action) return;

        if (this.settingsPanel.visible) {
          if (action === this.actions.toggleSettings) {
            this._setRegisteredPanelVisible('settings', false, true);
          }
          return;
        }

        if (action.startsWith('ui.pie.')) {
          if (!this.hudHidden) {
            const menuId = action.slice('ui.pie.'.length);
            this.pieMenuPanel.open(menuId);
          }
          return;
        }

        if (action === this.actions.toggleHud) {
          this.toggleHud();
        } else if (action === this.actions.toggleSettings) {
          this._toggleRegisteredPanel('settings');
        } else if (action === this.actions.toggleContentBrowser) {
          this._toggleRegisteredPanel('contentBrowser');
        } else if (action === this.actions.toggleViewportGizmo) {
          this._toggleRegisteredPanel('viewportGizmo');
        } else if (action === this.actions.droneMode || action === this.actions.walkMode) {
          if (this.contentBrowserPanel.visible) {
            this._setRegisteredPanelVisible('contentBrowser', false, true);
          }
        }
      }),
      this.eventBus.on('input:action:up', ({ action } = {}) => {
        if (action && action.startsWith('ui.pie.')) {
          const menuId = action.slice('ui.pie.'.length);
          this.pieMenuPanel.confirm(null, menuId);
        }
      }),
      this.eventBus.on('ui:togglePanel', ({ panel } = {}) => {
        if (this.settingsPanel.visible && panel !== 'settings') return;
        if (panel) this._toggleRegisteredPanel(panel);
      }),
      this.eventBus.on('ui:closeSettings', () => {
        if (this.settingsPanel.visible) {
          this._setRegisteredPanelVisible('settings', false, true);
        }
      }),
      this.eventBus.on('ui:animationsChanged', (patch = {}) => {
        this.uiConfig.animations = {
          ...this.uiConfig.animations,
          ...patch,
        };
        this._applyAnimationsConfig(this.uiConfig.animations);
        this._emitSave();
      }),
      this.eventBus.on('ui:closeContentBrowser', () => {
        if (this.contentBrowserPanel.visible) {
          this._setRegisteredPanelVisible('contentBrowser', false, true);
        }
      }),
      this.eventBus.on('ui:contentBrowserChanged', (patch = {}) => {
        this.uiConfig.contentBrowser = {
          ...this.uiConfig.contentBrowser,
          ...patch,
        };
        this._emitSave();
      }),
      this.eventBus.on('ui:editorPanelChanged', (patch = {}) => {
        this.uiConfig.editorPanel = {
          ...this.uiConfig.editorPanel,
          ...patch,
        };
        this._syncDockOffsets(
          this.uiConfig.panels.editorVisible ? 1 : 0,
          this.uiConfig.panels.contentBrowserVisible ? 1 : 0
        );
        this._emitSave();
      }),
      this.eventBus.on('viewport:guidesChanged', (patch = {}) => {
        this.uiConfig.viewportGuides = {
          ...this.uiConfig.viewportGuides,
          ...patch,
        };
        this._emitSave();
      }),
      this.eventBus.on('theme:applied', (payload = {}) => {
        const nextTheme = payload.id ?? payload.themeId ?? this.themeManager?.activeThemeId;
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
          this._syncDockOffsets(
            this.uiConfig.panels.editorVisible ? 1 : 0,
            this.uiConfig.panels.contentBrowserVisible ? 1 : 0
          );
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

  _syncDockOffsets(editorFactor, cbFactor) {
    const scale = (Number(this.uiConfig.uiScale?.value ?? 100) || 100) / 100;
    const baseEdWidth = Number(this.uiConfig.editorPanel?.widthPx ?? 300);
    const cbHeight =
      this.contentBrowserPanel?.el?.offsetHeight > 0
        ? this.contentBrowserPanel.el.offsetHeight
        : 270 * scale;

    document.documentElement.style.setProperty('--ed-width', `${baseEdWidth}px`);

    // Match .hud-editor-panel width expression exactly so Content Browser never has a seam
    if (editorFactor >= 1) {
      document.documentElement.style.setProperty(
        '--ed-dock-offset',
        'calc(var(--ed-width, 300px) * var(--ui-scale, 1))'
      );
    } else if (editorFactor <= 0) {
      document.documentElement.style.setProperty('--ed-dock-offset', '0px');
    } else {
      document.documentElement.style.setProperty(
        '--ed-dock-offset',
        `calc(var(--ed-width, 300px) * var(--ui-scale, 1) * ${editorFactor})`
      );
    }

    const cbOffset = cbHeight * cbFactor;
    document.documentElement.style.setProperty('--cb-dock-offset', `${cbOffset}px`);
    this.eventBus.emit('ui:viewportLayoutChanged', {
      editorDockOffsetPx: baseEdWidth * scale * editorFactor,
      contentBrowserDockOffsetPx: cbOffset,
    });
  }

  _animateDockOffsets(panelId, opening, durationMs) {
    if (this._dockRaf !== null) {
      cancelAnimationFrame(this._dockRaf);
      this._dockRaf = null;
    }

    const targetEd = this.uiConfig.panels.editorVisible ? 1 : 0;
    const targetCb = this.uiConfig.panels.contentBrowserVisible ? 1 : 0;

    if (durationMs <= 0) {
      this._syncDockOffsets(targetEd, targetCb);
      return;
    }

    const startTime = performance.now();
    const fromVal = opening ? 0 : 1;
    const toVal = opening ? 1 : 0;

    const tick = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, Math.max(0, elapsed / durationMs));
      const eased = easeOutPanel(t);
      const current = fromVal + (toVal - fromVal) * eased;

      const edFactor = panelId === 'editor' ? current : targetEd;
      const cbFactor = panelId === 'contentBrowser' ? current : targetCb;
      this._syncDockOffsets(edFactor, cbFactor);

      if (t < 1) {
        this._dockRaf = requestAnimationFrame(tick);
      } else {
        this._dockRaf = null;
        this._syncDockOffsets(targetEd, targetCb);
      }
    };

    this._dockRaf = requestAnimationFrame(tick);
  }

  _applyAnimationsConfig(animCfg = {}) {
    const enabled = Boolean(animCfg.enabled);
    const durationMs = enabled ? Math.max(0, Number(animCfg.durationMs ?? 160)) : 0;

    document.documentElement.style.setProperty('--ui-anim-duration', `${durationMs}ms`);
    document.body.classList.toggle('is-ui-animated', enabled && durationMs > 0);
    document.body.classList.toggle('is-anim-fade', enabled && Boolean(animCfg.fade));
    document.body.classList.toggle('is-anim-slide', enabled && Boolean(animCfg.slide));
    document.body.classList.toggle('is-anim-pie', enabled && Boolean(animCfg.pie));
  }

  _isAnimTypeEnabled(animType) {
    const anim = this.uiConfig.animations ?? {};
    if (!anim.enabled || Number(anim.durationMs ?? 0) <= 0) return false;
    return Boolean(anim[animType]);
  }

  _setRegisteredPanelVisible(panelId, nextVisible, persist = true) {
    const entry = this._panelRegistry[panelId];
    if (!entry) return;

    const { panel, key, animType } = entry;
    const el = panelId === 'settings' ? panel.backdropEl : panel.el;
    const prevTimer = this._panelAnimTimers.get(panelId);
    if (prevTimer) {
      clearTimeout(prevTimer);
      this._panelAnimTimers.delete(panelId);
    }

    this.uiConfig.panels[key] = Boolean(nextVisible);

    if (panelId === 'settings' && nextVisible && this.pieMenuPanel?.visible) {
      this.pieMenuPanel.cancel();
    }

    if (!el || !this._isAnimTypeEnabled(animType)) {
      el?.classList.remove('is-panel-hidden');
      panel.setVisible(Boolean(nextVisible));
      if (animType === 'slide') {
        this._syncDockOffsets(
          this.uiConfig.panels.editorVisible ? 1 : 0,
          this.uiConfig.panels.contentBrowserVisible ? 1 : 0
        );
      }
      if (persist) this._emitSave();
      return;
    }

    const durationMs = Math.max(0, Number(this.uiConfig.animations?.durationMs ?? 160));

    if (nextVisible) {
      el.classList.add('is-panel-hidden');
      panel.setVisible(true);
      if (animType === 'slide') {
        this._animateDockOffsets(panelId, true, durationMs);
      }
      requestAnimationFrame(() => {
        el.classList.remove('is-panel-hidden');
      });
    } else {
      el.classList.add('is-panel-hidden');
      if (animType === 'slide') {
        this._animateDockOffsets(panelId, false, durationMs);
      }
      const timer = setTimeout(() => {
        this._panelAnimTimers.delete(panelId);
        panel.setVisible(false);
        el.classList.remove('is-panel-hidden');
      }, durationMs);
      this._panelAnimTimers.set(panelId, timer);
    }

    if (persist) this._emitSave();
  }

  _toggleRegisteredPanel(panelId) {
    const entry = this._panelRegistry[panelId];
    if (!entry) return;
    const targetVisible = !Boolean(this.uiConfig.panels[entry.key]);
    this._setRegisteredPanelVisible(panelId, targetVisible, true);
  }

  _applyUiConfig(incoming) {
    const merged = mergeUiConfig(this.uiConfig, incoming);
    // Always restore default workspace layout & Render tab on page refresh
    merged.panels = { ...defaultUiSettings.panels };
    merged.editorPanel = {
      ...merged.editorPanel,
      activeTab: defaultUiSettings.editorPanel.activeTab,
    };

    this.uiConfig = merged;
    this.viewMode = merged.viewMode;
    this.hudHidden = Boolean(merged.hudHidden);

    this._applyAnimationsConfig(merged.animations);

    if (merged.theme && this.themeManager?.activeThemeId !== merged.theme) {
      this.themeManager?.setTheme?.(merged.theme);
    }
    this.settingsPanel?.setVisible?.(Boolean(merged.panels.settingsVisible));
    this.settingsPanel?.applyConfig?.(merged);
    this.statsPanel?.setVisible?.(Boolean(merged.panels.statsVisible));
    this.contentBrowserPanel?.setVisible?.(Boolean(merged.panels.contentBrowserVisible));
    this.contentBrowserPanel?.applyConfig?.(merged.contentBrowser);
    this.editorPanel?.setVisible?.(Boolean(merged.panels.editorVisible));
    this.editorPanel?.applyConfig?.(merged.editorPanel);
    this.editorPanel?.renderPanel?.applyConfig?.(merged);
    this.viewportGizmoPanel?.setVisible?.(Boolean(merged.panels.viewportGizmoVisible));
    this._applyUiScale(merged.uiScale.value / 100);
    this._syncDockOffsets(
      merged.panels.editorVisible ? 1 : 0,
      merged.panels.contentBrowserVisible ? 1 : 0
    );
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
        animations: { ...this.uiConfig.animations },
        panels: { ...this.uiConfig.panels },
        settingsPanel: { ...this.uiConfig.settingsPanel },
        editorPanel: { ...this.uiConfig.editorPanel },
        viewportGizmo: { ...this.uiConfig.viewportGizmo },
        pieMenu: structuredClone(this.uiConfig.pieMenu),
        viewportGuides: { ...this.uiConfig.viewportGuides },
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
    document.body.classList.toggle('is-hud-hidden', this.hudHidden);
    this.eventBus.emit('ui:hudVisibilityChanged', { hidden: this.hudHidden });
    this.eventBus.emit('ui:viewportLayoutChanged');
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
      this.viewportGizmoPanel.update(dt, ctx);
    }
  }

  dispose() {
    if (this._dockRaf !== null) {
      cancelAnimationFrame(this._dockRaf);
      this._dockRaf = null;
    }
    for (const timer of this._panelAnimTimers.values()) clearTimeout(timer);
    this._panelAnimTimers.clear();
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
    this.pieMenuPanel.dispose();
    this.viewportGizmoPanel.dispose();
    this.settingsPanel.dispose();
    this.statsPanel.dispose();
    this.contentBrowserPanel.dispose();
    this.editorPanel.dispose();
    this.container.remove();
  }
}
