import defaultUiSettings from '@/config/uiSettings.json';

const sectionModules = import.meta.glob('./settingSections/*.js', { eager: true });

function getSortedSectionFactories(config) {
  return Object.entries(sectionModules)
    .map(([path, mod]) => {
      const resolvedTitle =
        typeof mod.getTitle === 'function'
          ? mod.getTitle(config)
          : typeof mod.title === 'string' && mod.title.trim()
            ? mod.title.trim()
            : path;
      return {
        path,
        title: resolvedTitle,
        createSection: mod.createSection,
      };
    })
    .filter((entry) => typeof entry.createSection === 'function')
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}

function makeSectionCollapsible(groupEl, { title, collapsed = true } = {}) {
  const headerSlot =
    groupEl.querySelector('.hud-settings__section-head') ??
    groupEl.querySelector('.hud-ed__group-title');
  const titleEl = groupEl.querySelector('.hud-ed__group-title');
  if (!headerSlot || !titleEl) return null;

  const bodyEl = document.createElement('div');
  bodyEl.className = 'hud-ed__group-body';

  const childrenToMove = [...groupEl.children].filter((child) => child !== headerSlot);
  for (const child of childrenToMove) {
    bodyEl.appendChild(child);
  }
  groupEl.appendChild(bodyEl);

  const labelText = titleEl.textContent.trim() || title;
  titleEl.textContent = '';
  titleEl.classList.add('hud-ed__group-title--collapsible');
  titleEl.setAttribute('role', 'button');
  titleEl.tabIndex = 0;

  const caretSpan = document.createElement('span');
  caretSpan.className = 'hud-ed__group-caret';

  const textSpan = document.createElement('span');
  textSpan.textContent = labelText;

  titleEl.append(caretSpan, textSpan);

  let isCollapsed = Boolean(collapsed);

  const sync = () => {
    caretSpan.textContent = isCollapsed ? '▸' : '▾';
    groupEl.classList.toggle('is-collapsed', isCollapsed);
    titleEl.setAttribute('aria-expanded', String(!isCollapsed));
  };

  const toggle = () => {
    isCollapsed = !isCollapsed;
    sync();
  };

  titleEl.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });

  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    }
  });

  sync();
  return {
    setCollapsed(next) {
      isCollapsed = Boolean(next);
      sync();
    },
  };
}

export class SettingsPanel {
  constructor({ eventBus, themeManager, config = defaultUiSettings }) {
    this.eventBus = eventBus;
    this.themeManager = themeManager;
    this.config = config;
    this.visible = false;

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

    for (const evtName of ['pointerdown', 'mousedown', 'wheel']) {
      this.el.addEventListener(evtName, (e) => e.stopPropagation());
    }

    const isEditableTarget = (target) =>
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    this.el.addEventListener('contextmenu', (e) => {
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    });

    this.el.addEventListener('selectstart', (e) => {
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
    });

    this.backdropEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

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

    header.append(this.titleEl, this.closeBtn);

    const body = document.createElement('div');
    body.className = 'hud-panel__body hud-settings__body';

    this._sections = getSortedSectionFactories(this.config).map(({ title, createSection }) => {
      const instance = createSection({
        eventBus: this.eventBus,
        themeManager: this.themeManager,
        config: this.config,
      });
      let collapseCtrl = null;
      if (instance?.el) {
        collapseCtrl = makeSectionCollapsible(instance.el, {
          title,
          collapsed: true,
        });
      }
      return { title, collapseCtrl, ...instance };
    });

    for (const section of this._sections) {
      if (section.el) {
        body.appendChild(section.el);
      }
    }

    this.el.append(header, body);
    this.backdropEl.appendChild(this.el);

    this.backdropEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.target === this.backdropEl) {
        this.eventBus.emit('ui:closeSettings');
      }
    });

    this._onWindowKeyDown = (e) => {
      if (!this.visible || e.defaultPrevented) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.eventBus.emit('ui:closeSettings');
      }
    };
    window.addEventListener('keydown', this._onWindowKeyDown, false);
  }

  _applyModalMetrics(panelCfg) {
    this.el.style.setProperty('--settings-width', `${Number(panelCfg.widthPx)}px`);
    this.el.style.setProperty('--settings-min-height', `${Number(panelCfg.minHeightPx)}px`);
    this.el.style.setProperty('--settings-max-height', `${Number(panelCfg.maxHeightVh)}vh`);
  }

  applyConfig(nextConfig = {}) {
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

    for (const section of this._sections) {
      section.applyConfig?.(nextConfig);
    }
  }

  render() {
    for (const section of this._sections) {
      section.render?.();
    }
  }

  mount(parent) {
    parent.appendChild(this.backdropEl);
    this.render();
    this.setVisible(false);
  }

  _collapseAllSections() {
    for (const section of this._sections) {
      section.collapseCtrl?.setCollapsed?.(true);
    }
  }

  setVisible(next) {
    this.visible = Boolean(next);
    this._collapseAllSections();
    this.backdropEl.style.display = this.visible ? 'flex' : 'none';
    this.el.style.display = this.visible ? 'flex' : 'none';
    if (this.visible) {
      this.render();
    }
  }

  toggle() {
    this.setVisible(!this.visible);
  }

  setUiScale(percent) {
    for (const section of this._sections) {
      section.setUiScale?.(percent);
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onWindowKeyDown, false);
    for (const section of this._sections) {
      section.dispose?.();
    }
    this._sections = [];
    this.backdropEl.remove();
  }
}
