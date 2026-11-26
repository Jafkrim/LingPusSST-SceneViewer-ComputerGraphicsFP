import { EVENTS } from '@/engine/eventBus.js';

const STORAGE_CUSTOM_KEY = 'lingpussst:custom-themes';
const STORAGE_ACTIVE_KEY = 'lingpussst:active-theme';

// Scans every .js and .json file in this directory regardless of filename
const themeModules = import.meta.glob(['./*.js', './*.json', '!./themeManager.js'], { eager: true });

function isValidTheme(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    obj.tokens &&
    typeof obj.tokens === 'object' &&
    !Array.isArray(obj.tokens)
  );
}

export class ThemeManager {
  constructor(eventBus, defaultThemeId = null) {
    this.eventBus = eventBus;
    this.themes = new Map();
    this._appliedTokens = [];

    // 1. Register any file whose export matches the theme schema
    for (const mod of Object.values(themeModules)) {
      const candidate = mod.default ?? Object.values(mod).find(isValidTheme);
      if (isValidTheme(candidate)) {
        this.register({ ...candidate, builtIn: true });
      }
    }

    // 2. Load runtime-imported user themes from localStorage
    this._loadInstalledThemes();

    // 3. Apply saved -> explicit default -> first discovered theme
    const fallbackId =
      defaultThemeId && this.themes.has(defaultThemeId)
        ? defaultThemeId
        : this.themes.keys().next().value;

    const savedId = localStorage.getItem(STORAGE_ACTIVE_KEY);
    if (savedId && this.themes.has(savedId)) {
      this.apply(savedId);
    } else if (fallbackId) {
      this.apply(fallbackId);
    }
  }

  register(theme) {
    if (!isValidTheme(theme)) return false;
    this.themes.set(theme.id, theme);
    return true;
  }

  install(themeJson) {
    const theme = typeof themeJson === 'string' ? JSON.parse(themeJson) : themeJson;
    if (!isValidTheme(theme)) {
      throw new Error('Invalid theme: requires string id, string name, and tokens object.');
    }

    const customTheme = { ...theme, builtIn: false };
    this.themes.set(customTheme.id, customTheme);
    this._saveInstalledThemes();
    this.apply(customTheme.id);
    return customTheme;
  }

  uninstall(id) {
    const theme = this.themes.get(id);
    if (!theme || theme.builtIn) return false;

    this.themes.delete(id);
    this._saveInstalledThemes();

    if (this.activeId === id) {
      const nextId = this.themes.keys().next().value;
      if (nextId) this.apply(nextId);
    }
    return true;
  }

  apply(id) {
    const theme = this.themes.get(id);
    if (!theme) return false;

    const root = document.documentElement;
    root.dataset.theme = theme.id;

    for (const oldToken of this._appliedTokens) {
      if (!(oldToken in theme.tokens)) {
        root.style.removeProperty(oldToken);
      }
    }

    for (const [token, value] of Object.entries(theme.tokens)) {
      root.style.setProperty(token, value);
    }
    this._appliedTokens = Object.keys(theme.tokens);

    this.activeId = id;
    localStorage.setItem(STORAGE_ACTIVE_KEY, id);
    this.eventBus?.emit(EVENTS.THEME_CHANGED, theme);
    return true;
  }

  cycle() {
    const ids = Array.from(this.themes.keys());
    if (ids.length === 0) return;
    const nextIdx = (ids.indexOf(this.activeId) + 1) % ids.length;
    this.apply(ids[nextIdx]);
  }

  list() {
    return Array.from(this.themes.values());
  }

  _saveInstalledThemes() {
    const custom = this.list().filter((t) => !t.builtIn);
    localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(custom));
  }

  _loadInstalledThemes() {
    try {
      const raw = localStorage.getItem(STORAGE_CUSTOM_KEY);
      if (!raw) return;
      JSON.parse(raw).forEach((t) => {
        if (isValidTheme(t)) {
          this.themes.set(t.id, { ...t, builtIn: false });
        }
      });
    } catch {
      localStorage.removeItem(STORAGE_CUSTOM_KEY);
    }
  }
}
