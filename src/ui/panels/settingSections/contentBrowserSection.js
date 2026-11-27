import defaultUiSettings from '@/config/uiSettings.json';

export function getTitle(config = defaultUiSettings) {
  return (
    config.settingsPanel?.sections?.contentBrowser?.title ??
    defaultUiSettings.settingsPanel.sections.contentBrowser.title
  );
}

export const title = getTitle(defaultUiSettings);

export function createSection({ eventBus, config = defaultUiSettings }) {
  const getSectionCfg = (cfg = config) => ({
    ...defaultUiSettings.settingsPanel.sections.contentBrowser,
    ...(cfg.settingsPanel?.sections?.contentBrowser ?? {}),
  });

  let sectionCfg = getSectionCfg(config);
  let cbSettings = {
    ...defaultUiSettings.contentBrowser,
    ...(config.contentBrowser ?? {}),
  };
  let formats = {
    ...defaultUiSettings.contentBrowser.previewFormats,
    ...(cbSettings.previewFormats ?? {}),
  };
  cbSettings.previewFormats = formats;
  config.contentBrowser = cbSettings;

  const inputs = new Map();

  const el = document.createElement('div');
  el.className = 'hud-ed__group';

  const heading = document.createElement('div');
  heading.className = 'hud-ed__group-title';
  heading.textContent = sectionCfg.title;
  el.appendChild(heading);

  const listEl = document.createElement('div');
  listEl.className = 'hud-ed__group-body';
  el.appendChild(listEl);

  function rebuildRows() {
    listEl.innerHTML = '';
    inputs.clear();

    const sortedItems = [...(sectionCfg.formatOptions ?? [])].sort((a, b) =>
      String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' })
    );

    for (const item of sortedItems) {
      const row = document.createElement('label');
      row.className = 'hud-ed__check-row';

      const nameEl = document.createElement('span');
      nameEl.textContent = item.label;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(formats[item.key]);
      checkbox.addEventListener('change', () => {
        formats[item.key] = checkbox.checked;
        cbSettings.previewFormats = { ...formats };
        config.contentBrowser = { ...cbSettings };
        eventBus?.emit?.('ui:contentBrowserChanged', {
          previewFormats: { ...formats },
        });
      });

      inputs.set(item.key, checkbox);
      row.append(nameEl, checkbox);
      listEl.appendChild(row);
    }
  }

  rebuildRows();

  const unsubCbChanged = eventBus?.on?.('ui:contentBrowserChanged', (patch = {}) => {
    if (patch.previewFormats && typeof patch.previewFormats === 'object') {
      formats = { ...formats, ...patch.previewFormats };
      cbSettings.previewFormats = { ...formats };
      render();
    }
  });

  function render() {
    for (const [key, input] of inputs.entries()) {
      input.checked = Boolean(formats[key]);
    }
  }

  function applyConfig(nextConfig = {}) {
    sectionCfg = getSectionCfg(nextConfig);
    const patch = nextConfig.contentBrowser ?? {};
    cbSettings = { ...cbSettings, ...patch };
    formats = {
      ...defaultUiSettings.contentBrowser.previewFormats,
      ...(cbSettings.previewFormats ?? {}),
    };
    cbSettings.previewFormats = formats;
    config.contentBrowser = { ...cbSettings };
    rebuildRows();
  }

  function dispose() {
    unsubCbChanged?.();
    inputs.clear();
    el.remove();
  }

  return {
    el,
    applyConfig,
    render,
    dispose,
  };
}
