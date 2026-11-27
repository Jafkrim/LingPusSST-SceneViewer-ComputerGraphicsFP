import defaultUiSettings from '@/config/uiSettings.json';

const sectionModules = import.meta.glob('./renderSections/*.js', { eager: true });

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

export class RenderPanel {
  constructor({ eventBus, config = defaultUiSettings }) {
    this.eventBus = eventBus;
    this.config = config;

    this.el = document.createElement('div');
    this.el.className = 'hud-ed__tab-pane hud-render-panel';

    this._sections = getSortedSectionFactories(this.config).map(({ title, createSection }) => {
      const instance = createSection({ eventBus: this.eventBus, config: this.config });
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
        this.el.appendChild(section.el);
      }
    }
  }

  applyConfig(nextConfig = {}) {
    this.config = nextConfig;
    for (const section of this._sections) {
      section.applyConfig?.(nextConfig);
    }
  }

  render() {
    for (const section of this._sections) {
      section.render?.();
    }
  }

  setActive(active) {
    this.el.style.display = active ? 'flex' : 'none';
  }

  mount(parent) {
    parent.appendChild(this.el);
    this.render();
  }

  dispose() {
    for (const section of this._sections) {
      section.dispose?.();
    }
    this._sections = [];
    this.el.remove();
  }
}
