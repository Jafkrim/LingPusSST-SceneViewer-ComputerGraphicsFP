const EXCLUDED_HIERARCHY_NAMES = new Set([
  'ViewportGuides',
  'InfiniteFloorGrid',
  'InfiniteWorldAxes',
  'WorldAxisX',
  'WorldAxisY',
  'WorldAxisZ',
]);

const DISPLAY_NAME_OVERRIDES = Object.freeze({
  LightingRig: 'Lighting',
  WorldEntities: 'World',
});

export class HierarchyPanel {
  constructor({ eventBus, sceneManager = null }) {
    this.eventBus = eventBus;
    this.sceneManager = sceneManager;

    this._expandedIds = new Set();
    this._autoExpandedRoots = new Set();
    this._selectedIds = new Set();

    this.el = document.createElement('div');
    this.el.className = 'hud-ed__hierarchy';

    this._headerEl = document.createElement('div');
    this._headerEl.className = 'hud-panel__header hud-ed__section-header';

    const titleEl = document.createElement('span');
    titleEl.textContent = 'Hierarchy';

    this._headerEl.append(titleEl);

    this._treeEl = document.createElement('nav');
    this._treeEl.className = 'hud-ed__tree';

    this.el.append(this._headerEl, this._treeEl);

    this._unsubs = [
      this.eventBus?.on?.('scene:hierarchyChanged', () => this.render()),
      this.eventBus?.on?.('scene:changed', () => this.render()),
      this.eventBus?.on?.('scene:entityAdded', () => {
        if (this.sceneManager?.worldGroup) {
          this._expandedIds.add(this.sceneManager.worldGroup.uuid);
        }
        this.render();
      }),
      this.eventBus?.on?.('scene:entityRemoved', () => this.render()),
      this.eventBus?.on?.('scene:objectAdded', () => this.render()),
      this.eventBus?.on?.('scene:objectRemoved', () => this.render()),
      this.eventBus?.on?.('scene:selectionChanged', ({ objects, object } = {}) => {
        const list = Array.isArray(objects) ? objects : object ? [object] : [];
        this._selectedIds = new Set(list.map((o) => o?.uuid).filter(Boolean));
        this.render();
      }),
      this.eventBus?.on?.('selection:changed', ({ objects, object } = {}) => {
        const list = Array.isArray(objects) ? objects : object ? [object] : [];
        this._selectedIds = new Set(list.map((o) => o?.uuid).filter(Boolean));
        this.render();
      }),
    ].filter(Boolean);
  }

  _collectVisibleChildren(parent) {
    const out = [];
    const isEntityContainer =
      parent === this.sceneManager?.worldGroup || parent.name === 'WorldEntities';

    for (const child of parent.children ?? []) {
      if (
        child.userData?.isViewportGuide ||
        child.userData?.excludeFromHierarchy ||
        EXCLUDED_HIERARCHY_NAMES.has(child.name)
      ) {
        continue;
      }

      const rawName = child.name || child.type || 'Object3D';
      const label = DISPLAY_NAME_OVERRIDES[rawName] ?? rawName;

      // Stop recursion at spawned entity roots (.glb / .gltf / .prefab.json) so internal
      // author nodes (Sketchfab_model, GLTF_SceneRootNode, Blender rigs, etc.) stay hidden.
      const children =
        isEntityContainer || child.userData?.hideChildrenInHierarchy
          ? []
          : this._collectVisibleChildren(child);

      out.push({
        id: child.uuid,
        label,
        object: child,
        children,
      });
    }

    out.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, {
        sensitivity: 'base',
        numeric: true,
      })
    );

    return out;
  }

  _getRootNodes() {
    const scene = this.sceneManager?.scene ?? null;
    if (!scene) return [];

    if (!this._autoExpandedRoots.has(scene.uuid)) {
      this._autoExpandedRoots.add(scene.uuid);
      this._expandedIds.add(scene.uuid);
      if (this.sceneManager?.worldGroup) {
        this._expandedIds.add(this.sceneManager.worldGroup.uuid);
      }
    }

    return [
      {
        id: scene.uuid,
        label: scene.name || 'RootScene',
        object: scene,
        children: this._collectVisibleChildren(scene),
      },
    ];
  }

  render() {
    const roots = this._getRootNodes();
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
        const isActive = this._selectedIds.has(node.id);

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

        row.addEventListener('click', (e) => {
          const additive = Boolean(e.ctrlKey || e.metaKey);
          this.eventBus?.emit?.('selection:requestSelect', {
            object: node.object,
            additive,
          });
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
