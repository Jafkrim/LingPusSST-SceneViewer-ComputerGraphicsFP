const EXCLUDED_HIERARCHY_NAMES = new Set([
  'ViewportGuides',
  'InfiniteFloorGrid',
  'InfiniteWorldAxes',
  'WorldAxisX',
  'WorldAxisY',
  'WorldAxisZ',
]);

export class HierarchyPanel {
  constructor({ eventBus, sceneManager = null }) {
    this.eventBus = eventBus;
    this.sceneManager = sceneManager;

    this._expandedIds = new Set();
    this._selectedId = null;

    this.el = document.createElement('div');
    this.el.className = 'hud-ed__hierarchy';

    this._headerEl = document.createElement('div');
    this._headerEl.className = 'hud-panel__header hud-ed__section-header';

    const titleEl = document.createElement('span');
    titleEl.textContent = 'Hierarchy';

    this._countEl = document.createElement('span');
    this._countEl.className = 'hud-ed__count';
    this._countEl.textContent = '0 items';

    this._headerEl.append(titleEl, this._countEl);

    this._treeEl = document.createElement('nav');
    this._treeEl.className = 'hud-ed__tree';

    this.el.append(this._headerEl, this._treeEl);

    this._unsubs = [
      this.eventBus?.on?.('scene:hierarchyChanged', () => this.render()),
      this.eventBus?.on?.('scene:objectAdded', () => this.render()),
      this.eventBus?.on?.('scene:objectRemoved', () => this.render()),
      this.eventBus?.on?.('selection:changed', ({ object } = {}) => {
        this._selectedId = object?.uuid ?? null;
        this.render();
      }),
    ].filter(Boolean);
  }

  _collectVisibleChildren(parent) {
    const out = [];
    for (const child of parent.children ?? []) {
      if (
        child.userData?.isViewportGuide ||
        child.userData?.excludeFromHierarchy ||
        EXCLUDED_HIERARCHY_NAMES.has(child.name)
      ) {
        continue;
      }

      // Unwrap WorldEntities container so spawned scene entities appear directly under RootScene
      if (child.name === 'WorldEntities') {
        out.push(...this._collectVisibleChildren(child));
        continue;
      }

      out.push({
        id: child.uuid,
        label: child.name || child.type || 'Object3D',
        object: child,
        children: this._collectVisibleChildren(child),
      });
    }
    return out;
  }

  _getRootNodes() {
    const scene = this.sceneManager?.scene ?? null;
    if (!scene) return [];

    return [
      {
        id: scene.uuid,
        label: scene.name || 'RootScene',
        object: scene,
        children: this._collectVisibleChildren(scene),
      },
    ];
  }

  _countNodes(nodes) {
    let total = 0;
    for (const node of nodes) {
      total += 1 + this._countNodes(node.children);
    }
    return total;
  }

  render() {
    const roots = this._getRootNodes();
    const totalCount = this._countNodes(roots);
    this._countEl.textContent = `${totalCount} items`;
    this._treeEl.innerHTML = '';

    if (roots.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'hud-ed__empty';
      empty.textContent = 'Empty scene';
      this._treeEl.appendChild(empty);
      return;
    }

    const renderBranch = (nodes, depth) => {
      for (const node of nodes) {
        const hasChildren = node.children.length > 0;
        const isExpanded = hasChildren && this._expandedIds.has(node.id);
        const isActive = this._selectedId === node.id;

        const row = document.createElement('button');
        row.type = 'button';
        row.className = `hud-cb__tree-item${isActive ? ' is-active' : ''}`;
        row.style.paddingLeft = `calc(${6 + depth * 14}px * var(--ui-scale, 1))`;

        const caret = document.createElement('span');
        caret.className = 'hud-cb__tree-caret';
        caret.textContent = hasChildren ? (isExpanded ? '▾' : '▸') : '';
        caret.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!hasChildren) return;
          if (this._expandedIds.has(node.id)) {
            this._expandedIds.delete(node.id);
          } else {
            this._expandedIds.add(node.id);
          }
          this.render();
        });

        const text = document.createElement('span');
        text.textContent = node.label;

        row.append(caret, text);

        row.addEventListener('click', () => {
          this._selectedId = node.id;
          this.eventBus?.emit?.('selection:requestSelect', { object: node.object });
          this.render();
        });

        row.addEventListener('dblclick', () => {
          if (!hasChildren) return;
          if (this._expandedIds.has(node.id)) {
            this._expandedIds.delete(node.id);
          } else {
            this._expandedIds.add(node.id);
          }
          this.render();
        });

        this._treeEl.appendChild(row);

        if (isExpanded) {
          renderBranch(node.children, depth + 1);
        }
      }
    };

    renderBranch(roots, 0);
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
