import { ThemeManager } from './themes/themeManager.js';
import { StatsPanel } from './panels/statsPanel.js';

export class UiManager {
  constructor(hudRoot, eventBus, renderPipeline) {
    this.hudRoot = hudRoot;
    this.eventBus = eventBus;

    this.themeManager = new ThemeManager(eventBus);
    this.statsPanel = new StatsPanel(hudRoot, renderPipeline);
  }

  setTheme(id) {
    this.themeManager.apply(id);
  }

  toggleTheme() {
    this.themeManager.toggle();
  }

  installTheme(themeJson) {
    return this.themeManager.install(themeJson);
  }

  uninstallTheme(id) {
    return this.themeManager.uninstall(id);
  }

  getThemes() {
    return this.themeManager.list();
  }

  update(dt) {
    this.statsPanel.update(dt);
  }
}
