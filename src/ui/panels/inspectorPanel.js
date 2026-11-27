export class InspectorPanel {
  constructor({ eventBus }) {
    this.eventBus = eventBus;
    this._selectedObject = null;

    this.el = document.createElement('div');
    this.el.className = 'hud-ed__tab-pane hud-inspector-panel';

    this._bodyEl = document.createElement('div');
    this._bodyEl.className = 'hud-ed__blank';
    this.el.appendChild(this._bodyEl);

    this._unsubs = [
      this.eventBus?.on?.('selection:changed', ({ object } = {}) => {
        this._selectedObject = object ?? null;
        this.render();
      }),
    ].filter(Boolean);
  }

  render() {
    this._bodyEl.textContent = this._selectedObject
      ? this._selectedObject.name || this._selectedObject.type || 'Selected Object'
      : '';
  }

  setActive(active) {
    this.el.style.display = active ? 'flex' : 'none';
  }

  mount(parent) {
    parent.appendChild(this.el);
    this.render();
  }

  dispose() {
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
    this.el.remove();
  }
}
