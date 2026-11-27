import defaultUiSettings from '@/config/uiSettings.json';

const sectionModules = import.meta.glob('./renderSections/*.js', { eager: true });

function getSortedSectionFactories() {
  return Object.entries(sectionModules)
    .map(([path, mod]) => ({
      path,
      title: typeof mod.title === 'string' && mod.title.trim() ? mod.title.trim() : path,
      createSection: mod.createSection,
    }))
    .filter((entry) => typeof entry.createSection === 'function')
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}

export class RenderPanel {
  constructor({ eventBus, config = defaultUiSettings }) {
    this.eventBus = eventBus;
    this.config = config;

    this.el = document.createElement('div');
    this.el.className = 'hud-ed__tab-pane hud-render-panel';

    this._sections = getSortedSectionFactories().map(({ title, createSection }) => {
      const instance = createSection({ eventBus: this.eventBus, config: this.config });
      return { title, ...instance };
    });

    for (const section of this._sections) {
      if (section.el) {
        this.el.appendChild(section.el);
      }
    }
  }

  applyConfig(nextConfig = {}) {
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
