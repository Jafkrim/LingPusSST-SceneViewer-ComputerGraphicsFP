import defaultUiSettings from '@/config/uiSettings.json';

function scoreRelevance(name, query) {
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  return 99;
}

function rectsIntersect(a, b) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

export class ContentBrowserPanel {
  constructor({ eventBus, assetResolver, config = defaultUiSettings }) {
    this.eventBus = eventBus;
    this.assetResolver = assetResolver;
    this.config = config;

    const cbCfg = {
      ...defaultUiSettings.contentBrowser,
      ...(this.config.contentBrowser ?? {}),
    };
    this.config.contentBrowser = cbCfg;

    this.scopes = cbCfg.scopes;
    this.folders = cbCfg.folders;
    this.categories = cbCfg.categories;
    this.searchMinChars = cbCfg.searchMinChars;

    this._categoryOrder = new Map(this.categories.map((c, idx) => [c.id, idx]));

    this.visible = Boolean(this.config.panels?.contentBrowserVisible);
    this.hierarchyVisible = Boolean(cbCfg.hierarchyVisible);
    this.filtersVisible = Boolean(cbCfg.filtersVisible);
    this._activeFilters = new Set(cbCfg.activeFilters ?? this.categories.map((c) => c.id));

    this._selectedScope = 'all';
    this._selectedPack = 'all';
    this._selectedFolder = 'all';
    this._selectedKeys = new Set();
    this._lastAnchorKey = null;
    this._renderedEntries = [];
    this._cardElements = new Map();

    this._committedQuery = '';
    this._history = [{ scope: 'all', pack: 'all', folder: 'all' }];
    this._historyIndex = 0;

    this.el = document.createElement('section');
    this.el.className = 'hud-panel hud-content-browser';
    this.el.setAttribute('data-ui-interactive', 'true');

    // Prevent Opera/Chromium selection mini-menu AND blur search input when clicking outside it
    this.el.addEventListener('selectstart', (e) => {
      if (e.target !== this._searchInput) {
        e.preventDefault();
      }
    });

    this.el.addEventListener('mousedown', (e) => {
      if (e.target !== this._searchInput) {
        if (document.activeElement === this._searchInput) {
          this._searchInput.blur();
        }
        e.preventDefault();
      }
    });

    this.el.addEventListener('mouseup', (e) => {
      if (e.target !== this._searchInput) {
        window.getSelection()?.removeAllRanges?.();
      }
    });

    this.el.addEventListener('dblclick', (e) => {
      if (e.target !== this._searchInput) {
        e.preventDefault();
        window.getSelection()?.removeAllRanges?.();
      }
    });

    // 1. Top Toolbar
    this.header = document.createElement('div');
    this.header.className = 'hud-panel__header hud-cb__header';

    this._toggleHierarchyBtn = document.createElement('button');
    this._toggleHierarchyBtn.type = 'button';
    this._toggleHierarchyBtn.className = 'hud-panel__control hud-cb__toggle-btn';
    this._toggleHierarchyBtn.textContent = 'Hierarchy';
    this._toggleHierarchyBtn.addEventListener('click', () => {
      this.hierarchyVisible = !this.hierarchyVisible;
      this.config.contentBrowser.hierarchyVisible = this.hierarchyVisible;
      this._syncPaneVisibility();
      this._emitConfigChanged();
    });

    this._toggleFiltersBtn = document.createElement('button');
    this._toggleFiltersBtn.type = 'button';
    this._toggleFiltersBtn.className = 'hud-panel__control hud-cb__toggle-btn';
    this._toggleFiltersBtn.textContent = 'Filters';
    this._toggleFiltersBtn.addEventListener('click', () => {
      this.filtersVisible = !this.filtersVisible;
      this.config.contentBrowser.filtersVisible = this.filtersVisible;
      this._syncPaneVisibility();
      this._emitConfigChanged();
    });

    this._backBtn = document.createElement('button');
    this._backBtn.type = 'button';
    this._backBtn.className = 'hud-panel__control hud-cb__icon-btn';
    this._backBtn.textContent = '←';
    this._backBtn.addEventListener('click', () => this._stepHistory(-1));

    this._fwdBtn = document.createElement('button');
    this._fwdBtn.type = 'button';
    this._fwdBtn.className = 'hud-panel__control hud-cb__icon-btn';
    this._fwdBtn.textContent = '→';
    this._fwdBtn.addEventListener('click', () => this._stepHistory(1));

    this._breadcrumbEl = document.createElement('div');
    this._breadcrumbEl.className = 'hud-cb__breadcrumbs';

    // Custom Search Box + Theme-Styled Clear Button
    this._searchWrap = document.createElement('div');
    this._searchWrap.className = 'hud-cb__search-wrap';

    this._searchInput = document.createElement('input');
    this._searchInput.type = 'text';
    this._searchInput.className = 'hud-panel__control hud-cb__search';
    this._searchInput.autocomplete = 'off';
    this._searchInput.spellcheck = false;

    this._searchClearBtn = document.createElement('button');
    this._searchClearBtn.type = 'button';
    this._searchClearBtn.className = 'hud-cb__search-clear';
    this._searchClearBtn.textContent = '×';
    this._searchClearBtn.style.display = 'none';
    this._searchClearBtn.addEventListener('click', () => {
      this._searchInput.value = '';
      this._searchClearBtn.style.display = 'none';
      this._commitSearch();
    });

    this._searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._commitSearch();
      } else if (e.key === 'Escape') {
        this._searchInput.value = '';
        this._searchClearBtn.style.display = 'none';
        this._commitSearch();
        this._searchInput.blur();
      }
    });

    this._searchInput.addEventListener('input', () => {
      const hasText = this._searchInput.value.length > 0;
      this._searchClearBtn.style.display = hasText ? 'flex' : 'none';
      if (this._searchInput.value.trim() === '' && this._committedQuery !== '') {
        this._commitSearch();
      }
    });

    this._searchWrap.append(this._searchInput, this._searchClearBtn);

    this.header.append(
      this._toggleHierarchyBtn,
      this._toggleFiltersBtn,
      this._backBtn,
      this._fwdBtn,
      this._breadcrumbEl,
      this._searchWrap
    );

    // 2. Main Split Body
    this.body = document.createElement('div');
    this.body.className = 'hud-cb__body';

    this._treeEl = document.createElement('nav');
    this._treeEl.className = 'hud-cb__tree';

    this._filtersEl = document.createElement('aside');
    this._filtersEl.className = 'hud-cb__filters';

    this._gridEl = document.createElement('div');
    this._gridEl.className = 'hud-cb__grid';

    this._marqueeEl = document.createElement('div');
    this._marqueeEl.className = 'hud-cb__marquee';
    this._marqueeEl.style.display = 'none';
    this._gridEl.appendChild(this._marqueeEl);

    this._bindMarqueeSelection();

    this.body.append(this._treeEl, this._filtersEl, this._gridEl);

    // 3. Footer Status Bar
    this._footerEl = document.createElement('div');
    this._footerEl.className = 'hud-cb__footer';

    this.el.append(this.header, this.body, this._footerEl);

    this._unsubs = [
      this.eventBus?.on?.('content:manifestUpdated', () => {
        this._renderAll();
      }),
    ].filter(Boolean);

    this._syncPaneVisibility();
  }

  _bindMarqueeSelection() {
    let dragging = false;
    let moved = false;
    let startClientX = 0;
    let startClientY = 0;
    let baseSelection = new Set();

    const onPointerMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;

      const gridRect = this._gridEl.getBoundingClientRect();
      const selLeft = Math.min(startClientX, e.clientX);
      const selTop = Math.min(startClientY, e.clientY);
      const selRight = Math.max(startClientX, e.clientX);
      const selBottom = Math.max(startClientY, e.clientY);

      const clampedLeft = Math.max(gridRect.left, selLeft);
      const clampedTop = Math.max(gridRect.top, selTop);
      const clampedRight = Math.min(gridRect.right, selRight);
      const clampedBottom = Math.min(gridRect.bottom, selBottom);

      this._marqueeEl.style.display = 'block';
      this._marqueeEl.style.left = `${clampedLeft - gridRect.left + this._gridEl.scrollLeft}px`;
      this._marqueeEl.style.top = `${clampedTop - gridRect.top + this._gridEl.scrollTop}px`;
      this._marqueeEl.style.width = `${Math.max(0, clampedRight - clampedLeft)}px`;
      this._marqueeEl.style.height = `${Math.max(0, clampedBottom - clampedTop)}px`;

      const boxRect = {
        left: clampedLeft,
        top: clampedTop,
        right: clampedRight,
        bottom: clampedBottom,
      };

      const nextSelected = new Set(baseSelection);
      for (const [key, cardEl] of this._cardElements.entries()) {
        const cardRect = cardEl.getBoundingClientRect();
        if (rectsIntersect(boxRect, cardRect)) {
          nextSelected.add(key);
        }
      }

      this._selectedKeys = nextSelected;
      this._syncSelectionVisuals();
    };

    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      this._marqueeEl.style.display = 'none';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      if (!moved && this._selectedKeys.size > 0) {
        this._selectedKeys.clear();
        this._lastAnchorKey = null;
        this._syncSelectionVisuals();
      }
    };

    this._gridEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target !== this._gridEl) return;
      dragging = true;
      moved = false;
      startClientX = e.clientX;
      startClientY = e.clientY;
      baseSelection = e.ctrlKey || e.metaKey ? new Set(this._selectedKeys) : new Set();

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  }

  _handleCardClick(e, entry) {
    e.stopPropagation();
    const key = entry.key;

    if (e.shiftKey && this._lastAnchorKey) {
      const keys = this._renderedEntries.map((item) => item.key);
      const startIdx = keys.indexOf(this._lastAnchorKey);
      const endIdx = keys.indexOf(key);
      if (startIdx !== -1 && endIdx !== -1) {
        const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        if (!e.ctrlKey && !e.metaKey) {
          this._selectedKeys.clear();
        }
        for (let i = from; i <= to; i += 1) {
          this._selectedKeys.add(keys[i]);
        }
      }
    } else if (e.ctrlKey || e.metaKey) {
      if (this._selectedKeys.has(key)) {
        this._selectedKeys.delete(key);
      } else {
        this._selectedKeys.add(key);
      }
      this._lastAnchorKey = key;
    } else {
      this._selectedKeys.clear();
      this._selectedKeys.add(key);
      this._lastAnchorKey = key;
    }

    this._syncSelectionVisuals();
  }

  _syncSelectionVisuals() {
    for (const [key, cardEl] of this._cardElements.entries()) {
      cardEl.classList.toggle('is-selected', this._selectedKeys.has(key));
    }

    const total = this._renderedEntries.length;
    const selectedCount = [...this._selectedKeys].filter((k) => this._cardElements.has(k)).length;
    this._footerEl.textContent =
      selectedCount > 0 ? `${total} items (${selectedCount} selected)` : `${total} items`;
  }

  _resolveCategory(ext) {
    const lower = String(ext ?? '').toLowerCase();
    return (
      this.categories.find((cat) =>
        (cat.extensions ?? []).some((e) => lower === e.toLowerCase())
      ) ?? this.categories[this.categories.length - 1]
    );
  }

  _getFolderCategoryMeta() {
    return this.categories.find((c) => c.id === 'folder') ?? this.categories[0];
  }

  _compareEntries(a, b) {
    if (a.rank !== undefined && b.rank !== undefined && a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    if (this._committedQuery && a.name.length !== b.name.length) {
      return a.name.length - b.name.length;
    }
    const orderA = this._categoryOrder.get(a.catId) ?? 999;
    const orderB = this._categoryOrder.get(b.catId) ?? 999;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.name.localeCompare(b.name);
  }

  _emitConfigChanged() {
    this.eventBus?.emit?.('ui:contentBrowserChanged', {
      hierarchyVisible: this.hierarchyVisible,
      filtersVisible: this.filtersVisible,
      activeFilters: [...this._activeFilters],
    });
  }

  _syncPaneVisibility() {
    this.body.classList.toggle('is-hierarchy-hidden', !this.hierarchyVisible);
    this.body.classList.toggle('is-filters-hidden', !this.filtersVisible);
    this._toggleHierarchyBtn.classList.toggle('is-active', this.hierarchyVisible);
    this._toggleFiltersBtn.classList.toggle('is-active', this.filtersVisible);
  }

  _commitSearch() {
    const raw = this._searchInput.value.trim();
    if (raw.length === 0) {
      this._committedQuery = '';
      this._renderGrid();
      return;
    }
    if (raw.length < this.searchMinChars) return;
    this._committedQuery = raw;
    this._renderGrid();
  }

  _navigate(scope, pack = 'all', folder = 'all', pushHistory = true) {
    this._selectedScope = scope;
    this._selectedPack = pack;
    this._selectedFolder = folder;
    this._selectedKeys.clear();
    this._lastAnchorKey = null;

    if (pushHistory) {
      this._history = this._history.slice(0, this._historyIndex + 1);
      this._history.push({ scope, pack, folder });
      this._historyIndex = this._history.length - 1;
    }

    this._renderAll();
  }

  _stepHistory(delta) {
    const nextIdx = this._historyIndex + delta;
    if (nextIdx < 0 || nextIdx >= this._history.length) return;
    this._historyIndex = nextIdx;
    const entry = this._history[nextIdx];
    this._navigate(entry.scope, entry.pack, entry.folder, false);
  }

  _renderBreadcrumbs() {
    this._breadcrumbEl.innerHTML = '';
    this._backBtn.disabled = this._historyIndex <= 0;
    this._fwdBtn.disabled = this._historyIndex >= this._history.length - 1;

    const crumbs = [{ label: 'All', scope: 'all', pack: 'all', folder: 'all' }];
    if (this._selectedScope !== 'all') {
      crumbs.push({ label: this._selectedScope, scope: this._selectedScope, pack: 'all', folder: 'all' });
    }
    if (this._selectedPack !== 'all') {
      crumbs.push({
        label: this._selectedPack,
        scope: this._selectedScope,
        pack: this._selectedPack,
        folder: 'all',
      });
    }
    if (this._selectedFolder !== 'all') {
      crumbs.push({
        label: this._selectedFolder,
        scope: this._selectedScope,
        pack: this._selectedPack,
        folder: this._selectedFolder,
      });
    }

    crumbs.forEach((crumb, idx) => {
      if (idx > 0) {
        const sep = document.createElement('span');
        sep.className = 'hud-cb__crumb-sep';
        sep.textContent = '›';
        this._breadcrumbEl.appendChild(sep);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hud-cb__crumb-btn';
      btn.textContent = crumb.label;
      btn.addEventListener('click', () => this._navigate(crumb.scope, crumb.pack, crumb.folder));
      this._breadcrumbEl.appendChild(btn);
    });

    const currentLabel = crumbs[crumbs.length - 1]?.label ?? 'All';
    this._searchInput.placeholder = `Search ${currentLabel}...`;
  }

  _renderTree() {
    const manifest = this.assetResolver?.getManifest?.() ?? { packs: [] };
    this._treeEl.innerHTML = '';

    const addNode = ({ label, depth, active, expanded, hasChildren, onClick }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `hud-cb__tree-item${active ? ' is-active' : ''}`;
      btn.style.paddingLeft = `calc(${6 + depth * 14}px * var(--ui-scale, 1))`;

      const caret = document.createElement('span');
      caret.className = 'hud-cb__tree-caret';
      caret.textContent = hasChildren ? (expanded ? '▾' : '▸') : '';

      const text = document.createElement('span');
      text.textContent = label;

      btn.append(caret, text);
      btn.addEventListener('click', onClick);
      this._treeEl.appendChild(btn);
    };

    addNode({
      label: 'All',
      depth: 0,
      active: this._selectedScope === 'all',
      expanded: true,
      hasChildren: this.scopes.length > 0,
      onClick: () => this._navigate('all', 'all', 'all'),
    });

    for (const scope of this.scopes) {
      const scopePacks = (manifest.packs ?? []).filter((p) => p.scope === scope);
      const isScopeExpanded = this._selectedScope === scope;

      addNode({
        label: scope,
        depth: 1,
        active: isScopeExpanded && this._selectedPack === 'all',
        expanded: isScopeExpanded,
        hasChildren: scopePacks.length > 0,
        onClick: () => this._navigate(scope, 'all', 'all'),
      });

      if (!isScopeExpanded) continue;

      for (const packObj of scopePacks) {
        const isPackExpanded = this._selectedPack === packObj.pack;

        addNode({
          label: packObj.pack,
          depth: 2,
          active: isPackExpanded && this._selectedFolder === 'all',
          expanded: isPackExpanded,
          hasChildren: this.folders.length > 0,
          onClick: () => this._navigate(scope, packObj.pack, 'all'),
        });

        if (!isPackExpanded) continue;

        for (const folder of this.folders) {
          addNode({
            label: folder,
            depth: 3,
            active: this._selectedFolder === folder,
            expanded: false,
            hasChildren: false,
            onClick: () => this._navigate(scope, packObj.pack, folder),
          });
        }
      }
    }
  }

  _renderFilters() {
    this._filtersEl.innerHTML = '';

    const headerRow = document.createElement('div');
    headerRow.className = 'hud-cb__filters-header';

    const title = document.createElement('span');
    title.textContent = 'Categories';

    const allSelected = this._activeFilters.size === this.categories.length;
    const toggleAllBtn = document.createElement('button');
    toggleAllBtn.type = 'button';
    toggleAllBtn.className = 'hud-cb__filters-reset';
    toggleAllBtn.textContent = allSelected ? 'None' : 'All';
    toggleAllBtn.addEventListener('click', () => {
      if (this._activeFilters.size === this.categories.length) {
        this._activeFilters.clear();
      } else {
        this._activeFilters = new Set(this.categories.map((c) => c.id));
      }
      this.config.contentBrowser.activeFilters = [...this._activeFilters];
      this._renderFilters();
      this._renderGrid();
      this._emitConfigChanged();
    });

    headerRow.append(title, toggleAllBtn);
    this._filtersEl.appendChild(headerRow);

    for (const cat of this.categories) {
      const active = this._activeFilters.has(cat.id);
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `hud-cb__filter-pill${active ? ' is-active' : ''}`;
      pill.style.setProperty('--cat-color', `var(--cb-cat-${cat.id})`);

      const swatch = document.createElement('span');
      swatch.className = 'hud-cb__filter-swatch';

      const text = document.createElement('span');
      text.textContent = cat.label;

      pill.append(swatch, text);
      pill.addEventListener('click', () => {
        if (this._activeFilters.has(cat.id)) {
          this._activeFilters.delete(cat.id);
        } else {
          this._activeFilters.add(cat.id);
        }
        this.config.contentBrowser.activeFilters = [...this._activeFilters];
        this._renderFilters();
        this._renderGrid();
        this._emitConfigChanged();
      });

      this._filtersEl.appendChild(pill);
    }
  }

  _collectEntries() {
    const manifest = this.assetResolver?.getManifest?.() ?? { packs: [] };
    const query = this._committedQuery;
    const folderCat = this._getFolderCategoryMeta();
    const folderAllowed = this._activeFilters.has(folderCat.id);
    const results = [];

    if (query) {
      if (folderAllowed) {
        if (this._selectedScope === 'all') {
          for (const scope of this.scopes) {
            const rank = scoreRelevance(scope, query);
            if (rank < 99) {
              results.push({
                key: `folder:${scope}`,
                kind: 'folder',
                catId: folderCat.id,
                catLabel: folderCat.label,
                name: scope,
                rank,
                onOpen: () => this._navigate(scope, 'all', 'all'),
              });
            }
          }
        }
        for (const packObj of manifest.packs ?? []) {
          if (this._selectedScope !== 'all' && packObj.scope !== this._selectedScope) continue;
          if (this._selectedPack === 'all') {
            const pRank = scoreRelevance(packObj.pack, query);
            if (pRank < 99) {
              results.push({
                key: `folder:${packObj.scope}/${packObj.pack}`,
                kind: 'folder',
                catId: folderCat.id,
                catLabel: folderCat.label,
                name: packObj.pack,
                rank: pRank,
                onOpen: () => this._navigate(packObj.scope, packObj.pack, 'all'),
              });
            }
          }
          if (this._selectedFolder === 'all') {
            for (const folder of this.folders) {
              const fRank = scoreRelevance(folder, query);
              if (fRank < 99) {
                results.push({
                  key: `folder:${packObj.scope}/${packObj.pack}/${folder}`,
                  kind: 'folder',
                  catId: folderCat.id,
                  catLabel: folderCat.label,
                  name: folder,
                  rank: fRank,
                  onOpen: () => this._navigate(packObj.scope, packObj.pack, folder),
                });
              }
            }
          }
        }
      }

      for (const packObj of manifest.packs ?? []) {
        if (this._selectedScope !== 'all' && packObj.scope !== this._selectedScope) continue;
        if (this._selectedPack !== 'all' && packObj.pack !== this._selectedPack) continue;

        const buckets = packObj.folders ?? packObj.categories ?? {};
        for (const folder of this.folders) {
          if (this._selectedFolder !== 'all' && folder !== this._selectedFolder) continue;

          for (const item of buckets[folder] ?? []) {
            const cat = this._resolveCategory(item.ext);
            if (!this._activeFilters.has(cat.id)) continue;

            const rank = scoreRelevance(item.name, query);
            if (rank >= 99) continue;

            results.push({
              key: `asset:${item.logicalPath}`,
              kind: 'asset',
              catId: cat.id,
              catLabel: cat.label,
              name: item.name,
              rank,
              item,
            });
          }
        }
      }

      results.sort((a, b) => this._compareEntries(a, b));
      return results;
    }

    if (folderAllowed) {
      if (this._selectedScope === 'all') {
        for (const scope of this.scopes) {
          results.push({
            key: `folder:${scope}`,
            kind: 'folder',
            catId: folderCat.id,
            catLabel: folderCat.label,
            name: scope,
            onOpen: () => this._navigate(scope, 'all', 'all'),
          });
        }
        return results;
      }

      if (this._selectedPack === 'all') {
        const scopePacks = (manifest.packs ?? []).filter((p) => p.scope === this._selectedScope);
        for (const p of scopePacks) {
          results.push({
            key: `folder:${this._selectedScope}/${p.pack}`,
            kind: 'folder',
            catId: folderCat.id,
            catLabel: folderCat.label,
            name: p.pack,
            onOpen: () => this._navigate(this._selectedScope, p.pack, 'all'),
          });
        }
        return results;
      }

      if (this._selectedFolder === 'all') {
        for (const folder of this.folders) {
          results.push({
            key: `folder:${this._selectedScope}/${this._selectedPack}/${folder}`,
            kind: 'folder',
            catId: folderCat.id,
            catLabel: folderCat.label,
            name: folder,
            onOpen: () => this._navigate(this._selectedScope, this._selectedPack, folder),
          });
        }
        return results;
      }
    }

    for (const packObj of manifest.packs ?? []) {
      if (packObj.scope !== this._selectedScope || packObj.pack !== this._selectedPack) continue;
      const buckets = packObj.folders ?? packObj.categories ?? {};
      for (const item of buckets[this._selectedFolder] ?? []) {
        const cat = this._resolveCategory(item.ext);
        if (!this._activeFilters.has(cat.id)) continue;
        results.push({
          key: `asset:${item.logicalPath}`,
          kind: 'asset',
          catId: cat.id,
          catLabel: cat.label,
          name: item.name,
          item,
        });
      }
    }

    results.sort((a, b) => this._compareEntries(a, b));
    return results;
  }

  _renderGrid() {
    const entries = this._collectEntries();
    this._renderedEntries = entries;
    this._cardElements.clear();

    this._gridEl.innerHTML = '';
    this._gridEl.appendChild(this._marqueeEl);

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'hud-cb__empty';
      empty.textContent = this._committedQuery
        ? `No results for "${this._committedQuery}".`
        : 'No matching items.';
      this._gridEl.appendChild(empty);
    } else {
      for (const entry of entries) {
        const isSelected = this._selectedKeys.has(entry.key);
        const card = document.createElement('div');
        card.role = 'button';
        card.tabIndex = 0;
        card.className = `hud-cb__card${isSelected ? ' is-selected' : ''}`;
        card.style.setProperty('--cat-color', `var(--cb-cat-${entry.catId})`);
        card.title = entry.kind === 'folder' ? entry.name : entry.item.logicalPath;

        const preview = document.createElement('div');
        preview.className = 'hud-cb__preview';

        const badge = document.createElement('span');
        badge.className = 'hud-cb__badge';
        badge.textContent = entry.catLabel;
        preview.appendChild(badge);

        const isWebImage =
          entry.kind === 'asset' &&
          entry.catId === 'texture' &&
          /\.(png|jpe?g|webp)$/i.test(entry.item.ext);

        if (isWebImage) {
          const img = document.createElement('img');
          img.className = 'hud-cb__thumb-img';
          img.src = entry.item.url;
          img.alt = entry.name;
          img.loading = 'lazy';
          img.draggable = false;
          preview.appendChild(img);
        } else {
          const glyph = document.createElement('span');
          glyph.className =
            entry.kind === 'folder'
              ? 'hud-cb__glyph hud-cb__glyph--folder'
              : 'hud-cb__glyph hud-cb__glyph--type';
          glyph.textContent = entry.kind === 'folder' ? '📁' : entry.catLabel;
          preview.appendChild(glyph);
        }

        const nameEl = document.createElement('span');
        nameEl.className = 'hud-cb__name';
        nameEl.textContent = entry.name;

        card.append(preview, nameEl);

        card.addEventListener('click', (e) => this._handleCardClick(e, entry));

        card.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          if (entry.kind === 'folder') {
            entry.onOpen();
            return;
          }

          const selectedAssets = this._renderedEntries.filter(
            (item) => item.kind === 'asset' && this._selectedKeys.has(item.key)
          );
          const targets = selectedAssets.length > 0 ? selectedAssets : [entry];
          for (const target of targets) {
            this.eventBus?.emit?.('content:activateAsset', {
              ...target.item,
              category: target.item.folder,
            });
          }
        });

        this._cardElements.set(entry.key, card);
        this._gridEl.appendChild(card);
      }
    }

    this._syncSelectionVisuals();
  }

  _renderAll() {
    this._renderBreadcrumbs();
    this._renderTree();
    this._renderFilters();
    this._renderGrid();
  }

  applyConfig(cbCfg = {}) {
    if (typeof cbCfg.hierarchyVisible === 'boolean') {
      this.hierarchyVisible = cbCfg.hierarchyVisible;
    }
    if (typeof cbCfg.filtersVisible === 'boolean') {
      this.filtersVisible = cbCfg.filtersVisible;
    }
    if (Array.isArray(cbCfg.activeFilters)) {
      this._activeFilters = new Set(cbCfg.activeFilters);
    }
    this._syncPaneVisibility();
    this._renderAll();
  }

  mount(parent) {
    parent.appendChild(this.el);
    this._renderAll();
    this.setVisible(this.visible);
  }

  setVisible(next) {
    const prev = this.visible;
    this.visible = Boolean(next);
    this.el.style.display = this.visible ? '' : 'none';
    if (prev !== this.visible) {
      this.eventBus?.emit?.('ui:contentBrowserVisibilityChanged', { visible: this.visible });
    }
  }

  toggle() {
    this.setVisible(!this.visible);
  }

  dispose() {
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
    this.el.remove();
  }
}
