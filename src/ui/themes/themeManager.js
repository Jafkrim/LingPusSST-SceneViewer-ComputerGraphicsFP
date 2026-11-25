import { EVENTS } from '@/engine/eventBus.js';
import { builtInDark } from './builtInDark.js';
import { builtInWhite } from './builtInWhite.js';

const STORAGE_CUSTOM_KEY = 'lingpussst:custom-themes';
const STORAGE_ACTIVE_KEY = 'lingpussst:active-theme';

export class ThemeManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.themes = new Map();

    this.register(builtInDark);
    this.register(builtInWhite);
    this._loadInstalledThemes();

    const savedId = localStorage.getItem(STORAGE_ACTIVE_KEY) || builtInDark.id;
    this.apply(this.themes.has(savedId) ? savedId : builtInDark.id);
  }

  register(theme) {
    this.themes.set(theme.id, theme);
  }

  install(themeJson) {
    const theme = typeof themeJson === 'string' ? JSON.parse(themeJson) : themeJson;
    if (!theme?.id || !theme?.name || !theme?.tokens) {
      throw new Error('Invalid theme JSON: requires id, name, and tokens.');
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
      this.apply(builtInDark.id);
    }
    return true;
  }

  apply(id) {
    const theme = this.themes.get(id);
    if (!theme) return;

    const root = document.documentElement;
    for (const [token, value] of Object.entries(theme.tokens)) {
      root.style.setProperty(token, value);
    }

    this.activeId = id;
    localStorage.setItem(STORAGE_ACTIVE_KEY, id);
    this.eventBus?.emit(EVENTS.THEME_CHANGED, theme);
  }

  toggle() {
    const next = this.activeId === builtInDark.id ? builtInWhite.id : builtInDark.id;
    this.apply(next);
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
      JSON.parse(raw).forEach((t) => this.themes.set(t.id, { ...t, builtIn: false }));
    } catch {
      localStorage.removeItem(STORAGE_CUSTOM_KEY);
    }
  }
}
