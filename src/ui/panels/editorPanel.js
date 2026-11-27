import defaultUiSettings from '@/config/uiSettings.json';
import { HierarchyPanel } from '@/ui/panels/hierarchyPanel.js';
import { InspectorPanel } from '@/ui/panels/inspectorPanel.js';
import { RenderPanel } from '@/ui/panels/renderPanel.js';

export class EditorPanel {
  constructor({ eventBus, sceneManager = null, config = defaultUiSettings }) {
    this.eventBus = eventBus;
    this.sceneManager = sceneManager;
    this.config = config;

    const edCfg = {
      ...defaultUiSettings.editorPanel,
      ...(this.config.editorPanel ?? {}),
    };
    this.config.editorPanel = edCfg;

    this.visible = Boolean(this.config.panels?.editorVisible ?? true);
    this.widthPx = Number(edCfg.widthPx);
    this.hierarchyHeightPx = Number(edCfg.hierarchyHeightPx);
    this.hierarchyMinHeightPx = Number(edCfg.hierarchyMinHeightPx);
    this.hierarchyMaxHeightPx = Number(edCfg.hierarchyMaxHeightPx);
    this.activeTab = edCfg.activeTab === 'render' ? 'render' : 'inspector';

    this.el = document.createElement('aside');
    this.el.className = 'hud-panel hud-editor-panel';
    this.el.setAttribute('data-ui-interactive', 'true');

    // Prevent Opera/Chromium selection popup on double-click
    this.el.addEventListener('selectstart', (e) => {
      if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
    });
    this.el.addEventListener('mousedown', (e) => {
      if (!(e.target instanceof HTMLInputElement)) {
        if (document.activeElement instanceof HTMLElement && document.activeElement !== e.target) {
          document.activeElement.blur();
        }
        e.preventDefault();
      }
    });
    this.el.addEventListener('dblclick', (e) => {
      if (!(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        window.getSelection()?.removeAllRanges?.();
      }
    });

    // Top: HierarchyPanel
    this.hierarchyPanel = new HierarchyPanel({ eventBus, sceneManager });
    this.hierarchyPanel.mount(this.el);

    // Draggable Bottom Edge Splitter for Hierarchy
    this._resizerEl = document.createElement('div');
    this._resizerEl.className = 'hud-ed__resizer';
    this._bindHierarchyResize();
    this.el.appendChild(this._resizerEl);

    // Bottom Tab Strip: Inspector (left) | Render (right)
    this._tabsBar = document.createElement('div');
    this._tabsBar.className = 'hud-ed__tabs';

    this._inspectorTabBtn = document.createElement('button');
    this._inspectorTabBtn.type = 'button';
    this._inspectorTabBtn.className = 'hud-ed__tab-btn';
    this._inspectorTabBtn.textContent = 'Inspector';
    this._inspectorTabBtn.addEventListener('click', () => this.setActiveTab('inspector'));

    this._renderTabBtn = document.createElement('button');
    this._renderTabBtn.type = 'button';
    this._renderTabBtn.className = 'hud-ed__tab-btn';
    this._renderTabBtn.textContent = 'Render';
    this._renderTabBtn.addEventListener('click', () => this.setActiveTab('render'));

    this._tabsBar.append(this._inspectorTabBtn, this._renderTabBtn);
    this.el.appendChild(this._tabsBar);

    // Bottom Content Body (shows only Inspector OR Render)
    this._tabContentEl = document.createElement('div');
    this._tabContentEl.className = 'hud-ed__content';

    this.inspectorPanel = new InspectorPanel({ eventBus });
    this.renderPanel = new RenderPanel({ eventBus, config: this.config });

    this.inspectorPanel.mount(this._tabContentEl);
    this.renderPanel.mount(this._tabContentEl);
    this.el.appendChild(this._tabContentEl);

    this._syncDimensions();
    this._syncTabs();
  }

  _getUiScale() {
    return (Number(this.config.uiScale?.value ?? 100) || 100) / 100;
  }

  _bindHierarchyResize() {
    let dragging = false;
    let startY = 0;
    let startHeight = 0;

    const onPointerMove = (e) => {
      if (!dragging) return;
      const scale = this._getUiScale();
      const deltaLogical = (e.clientY - startY) / scale;
      const panelLogicalHeight = this.el.getBoundingClientRect().height / scale;
      const maxAllowed = Math.min(
        this.hierarchyMaxHeightPx,
        Math.max(this.hierarchyMinHeightPx, panelLogicalHeight - 120)
      );

      this.hierarchyHeightPx = Math.round(
        Math.min(maxAllowed, Math.max(this.hierarchyMinHeightPx, startHeight + deltaLogical))
      );
      this.config.editorPanel.hierarchyHeightPx = this.hierarchyHeightPx;
      this._syncDimensions();
    };

    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      this._resizerEl.classList.remove('is-dragging');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      this._emitChanged();
    };

    this._resizerEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      startY = e.clientY;
      startHeight = this.hierarchyHeightPx;
      this._resizerEl.classList.add('is-dragging');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  }

  _syncDimensions() {
    document.documentElement.style.setProperty('--ed-width', `${this.widthPx}px`);
    document.documentElement.style.setProperty('--ed-hierarchy-height', `${this.hierarchyHeightPx}px`);
    document.documentElement.style.setProperty(
      '--ed-dock-offset',
      this.visible ? `calc(${this.widthPx}px * var(--ui-scale, 1))` : '0px'
    );
    this.eventBus?.emit?.('ui:viewportLayoutChanged');
  }

  _syncTabs() {
    const isInspector = this.activeTab === 'inspector';
    this._inspectorTabBtn.classList.toggle('is-active', isInspector);
    this._renderTabBtn.classList.toggle('is-active', !isInspector);
    this.inspectorPanel.setActive(isInspector);
    this.renderPanel.setActive(!isInspector);
  }

  _emitChanged() {
    this.eventBus?.emit?.('ui:editorPanelChanged', {
      widthPx: this.widthPx,
      hierarchyHeightPx: this.hierarchyHeightPx,
      activeTab: this.activeTab,
    });
  }

  setActiveTab(tab) {
    const next = tab === 'render' ? 'render' : 'inspector';
    if (this.activeTab === next) return;
    this.activeTab = next;
    this.config.editorPanel.activeTab = next;
    this._syncTabs();
    this._emitChanged();
  }

  applyConfig(edCfg = {}) {
    if (typeof edCfg.widthPx === 'number') this.widthPx = edCfg.widthPx;
    if (typeof edCfg.hierarchyHeightPx === 'number') this.hierarchyHeightPx = edCfg.hierarchyHeightPx;
    if (edCfg.activeTab === 'inspector' || edCfg.activeTab === 'render') {
      this.activeTab = edCfg.activeTab;
    }
    this._syncDimensions();
    this._syncTabs();
  }

  mount(parent) {
    parent.appendChild(this.el);
    this.setVisible(this.visible);
  }

  setVisible(next) {
    this.visible = Boolean(next);
    this.config.panels.editorVisible = this.visible;
    this.el.style.display = this.visible ? 'flex' : 'none';
    this._syncDimensions();
  }

  toggle() {
    this.setVisible(!this.visible);
  }

  dispose() {
    this.hierarchyPanel.dispose();
    this.inspectorPanel.dispose();
    this.renderPanel.dispose();
    this.el.remove();
  }
}
