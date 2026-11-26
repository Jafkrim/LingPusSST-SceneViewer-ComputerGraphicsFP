const DISCOVERED_THEME_MODULES = import.meta.glob('./*.json', { eager: true });

export class ThemeManager {
  constructor({ eventBus, root = document.documentElement, initialThemeId = null }) {
    this.eventBus = eventBus;
    this.root = root;
    this.themes = new Map();
    this.activeThemeId = null;

    this._discoverThemes(DISCOVERED_THEME_MODULES);

    const targetId =
      initialThemeId && this.themes.has(initialThemeId)
        ? initialThemeId
        : this.themes.keys().next().value ?? null;

    if (targetId) {
      this.setTheme(targetId);
    }
  }

  _discoverThemes(modules) {
    for (const mod of Object.values(modules)) {
      const def = mod?.default ?? mod;
      if (def && typeof def.id === 'string' && def.tokens && typeof def.tokens === 'object') {
        this.install(def);
      }
    }
  }

  install(themeDef) {
    if (!themeDef || typeof themeDef.id !== 'string' || typeof themeDef.tokens !== 'object') {
      throw new Error('Invalid theme definition: requires string "id" and object "tokens".');
    }
    this.themes.set(themeDef.id, {
      id: themeDef.id,
      name: themeDef.name ?? themeDef.id,
      tokens: { ...themeDef.tokens },
    });
    this.eventBus?.emit('theme:installed', { id: themeDef.id });
    return themeDef.id;
  }

  async installFromUrl(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch theme JSON from "${url}" (${response.status}).`);
    }
    const json = await response.json();
    return this.install(json);
  }

  uninstall(id) {
    const removed = this.themes.delete(id);
    if (removed && this.activeThemeId === id) {
      const nextId = this.themes.keys().next().value ?? null;
      this.activeThemeId = null;
      if (nextId) {
        this.setTheme(nextId);
      }
    }
    return removed;
  }

  listThemes() {
    return [...this.themes.values()].map(({ id, name }) => ({ id, name }));
  }

  setTheme(id) {
    const theme = this.themes.get(id);
    if (!theme) return false;

    for (const [token, value] of Object.entries(theme.tokens)) {
      this.root.style.setProperty(token, String(value));
    }

    this.activeThemeId = theme.id;
    this.eventBus?.emit('theme:applied', {
      id: theme.id,
      name: theme.name,
      tokens: theme.tokens,
    });
    return true;
  }
}
