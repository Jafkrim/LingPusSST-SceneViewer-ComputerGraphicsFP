import defaultKeybinds from '@/config/keybinds.json';
import defaultUiSettings from '@/config/uiSettings.json';

export function getTitle(config = defaultUiSettings) {
  return (
    config.settingsPanel?.sections?.keybinds?.title ??
    defaultUiSettings.settingsPanel.sections.keybinds.title
  );
}

export const title = getTitle(defaultUiSettings);

function normalizeSingleBindingMap(rawMap = {}) {
  const out = {};
  for (const [action, val] of Object.entries(rawMap)) {
    if (Array.isArray(val)) {
      const first = val.find((v) => typeof v === 'string' && v.trim().length > 0);
      out[action] = first ? [first.trim()] : [];
    } else if (typeof val === 'string' && val.trim().length > 0) {
      out[action] = [val.trim()];
    } else {
      out[action] = [];
    }
  }
  return out;
}

function formatActionLabel(action) {
  return String(action)
    .split('.')
    .map((part) =>
      part
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, (ch) => ch.toUpperCase())
    )
    .join(' › ');
}

function buildComboFromKeyboardEvent(e) {
  const parts = [];
  if (e.ctrlKey && e.code !== 'ControlLeft' && e.code !== 'ControlRight') {
    parts.push('ControlLeft');
  }
  if (e.altKey && e.code !== 'AltLeft' && e.code !== 'AltRight') {
    parts.push('AltLeft');
  }
  if (e.shiftKey && e.code !== 'ShiftLeft' && e.code !== 'ShiftRight') {
    parts.push('ShiftLeft');
  }
  parts.push(e.code);
  return parts.join('+');
}

export function createSection({ eventBus, config = defaultUiSettings }) {
  const getSectionCfg = (cfg = config) => ({
    ...defaultUiSettings.settingsPanel.sections.keybinds,
    ...(cfg.settingsPanel?.sections?.keybinds ?? {}),
  });

  let sectionCfg = getSectionCfg(config);
  let bindings = normalizeSingleBindingMap(config.keybinds ?? defaultKeybinds);
  let capturingAction = null;
  let captureCleanup = null;

  const buttons = new Map();

  const formatSingleShortcut = (combo) => {
    const list = Array.isArray(combo) ? combo : combo ? [combo] : [];
    return list[0] ? list[0] : sectionCfg.unboundLabel;
  };

  const el = document.createElement('div');
  el.className = 'hud-ed__group';

  const headerRow = document.createElement('div');
  headerRow.className = 'hud-field__row hud-settings__section-head';

  const heading = document.createElement('div');
  heading.className = 'hud-ed__group-title';
  heading.textContent = sectionCfg.title;

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'hud-panel__control hud-settings__inline-btn';
  resetBtn.textContent = sectionCfg.resetLabel;
  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    stopCapture();
    bindings = normalizeSingleBindingMap(defaultKeybinds);
    config.keybinds = structuredClone(bindings);
    render();
    eventBus?.emit?.('settings:keybindsChanged', { keybinds: structuredClone(bindings) });
  });

  headerRow.append(heading, resetBtn);
  el.appendChild(headerRow);

  const listEl = document.createElement('div');
  listEl.className = 'hud-keybinds-list';
  el.appendChild(listEl);

  function stopCapture() {
    if (captureCleanup) {
      captureCleanup();
      captureCleanup = null;
    }
    capturingAction = null;
  }

  function startCapture(action, btn) {
    stopCapture();
    capturingAction = action;
    btn.textContent = sectionCfg.capturingLabel;
    btn.classList.add('is-capturing');

    const finish = (nextCombo) => {
      stopCapture();
      if (nextCombo !== undefined) {
        bindings[action] = nextCombo ? [nextCombo] : [];
        config.keybinds = structuredClone(bindings);
        eventBus?.emit?.('settings:keybindsChanged', { keybinds: structuredClone(bindings) });
      }
      render();
    };

    const onKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape') {
        finish(undefined);
        return;
      }
      if (e.code === 'Backspace' || e.code === 'Delete') {
        finish(null);
        return;
      }

      if (
        e.code === 'ControlLeft' ||
        e.code === 'ControlRight' ||
        e.code === 'AltLeft' ||
        e.code === 'AltRight' ||
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight'
      ) {
        return;
      }

      finish(buildComboFromKeyboardEvent(e));
    };

    const onKeyUp = (e) => {
      if (
        e.code === 'ControlLeft' ||
        e.code === 'ControlRight' ||
        e.code === 'AltLeft' ||
        e.code === 'AltRight' ||
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight'
      ) {
        e.preventDefault();
        e.stopPropagation();
        finish(e.code);
      }
    };

    const onPointerDown = (e) => {
      if (e.target === btn) return;
      if (e.button === 0 || e.button === 1 || e.button === 2) {
        finish(undefined);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const parts = [];
      if (e.ctrlKey) parts.push('ControlLeft');
      if (e.altKey) parts.push('AltLeft');
      if (e.shiftKey) parts.push('ShiftLeft');
      parts.push(`Mouse${e.button}`);
      finish(parts.join('+'));
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('pointerdown', onPointerDown, true);

    captureCleanup = () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      btn.classList.remove('is-capturing');
    };
  }

  function rebuildList() {
    listEl.innerHTML = '';
    buttons.clear();

    const sortedActions = Object.keys(bindings).sort((a, b) =>
      formatActionLabel(a).localeCompare(formatActionLabel(b), undefined, { sensitivity: 'base' })
    );

    for (const action of sortedActions) {
      const row = document.createElement('div');
      row.className = 'hud-ed__check-row hud-keybind-row';

      const nameEl = document.createElement('span');
      nameEl.className = 'hud-keybind-row__label';
      nameEl.textContent = formatActionLabel(action);

      const bindBtn = document.createElement('button');
      bindBtn.type = 'button';
      bindBtn.className = 'hud-panel__control hud-keybind-row__btn';
      bindBtn.textContent = formatSingleShortcut(bindings[action]);
      bindBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (capturingAction === action) {
          stopCapture();
          render();
        } else {
          startCapture(action, bindBtn);
        }
      });

      buttons.set(action, bindBtn);
      row.append(nameEl, bindBtn);
      listEl.appendChild(row);
    }
  }

  const unsubConfigLoaded = eventBus?.on?.('config:loaded', ({ fileName, data } = {}) => {
    if (fileName === 'keybinds.json' && data && typeof data === 'object') {
      bindings = normalizeSingleBindingMap(data);
      config.keybinds = structuredClone(bindings);
      render();
    }
  });

  const unsubKeybindsChanged = eventBus?.on?.('settings:keybindsChanged', ({ keybinds } = {}) => {
    if (keybinds && typeof keybinds === 'object') {
      bindings = normalizeSingleBindingMap(keybinds);
      config.keybinds = structuredClone(bindings);
      render();
    }
  });

  function render() {
    if (buttons.size !== Object.keys(bindings).length) {
      rebuildList();
      return;
    }
    for (const [action, btn] of buttons.entries()) {
      if (capturingAction !== action) {
        btn.textContent = formatSingleShortcut(bindings[action]);
      }
    }
  }

  function applyConfig(nextConfig = {}) {
    sectionCfg = getSectionCfg(nextConfig);
    resetBtn.textContent = sectionCfg.resetLabel;
    if (nextConfig.keybinds && typeof nextConfig.keybinds === 'object') {
      bindings = normalizeSingleBindingMap(nextConfig.keybinds);
      rebuildList();
    } else if (nextConfig && typeof nextConfig === 'object' && nextConfig['camera.moveForward']) {
      bindings = normalizeSingleBindingMap(nextConfig);
      rebuildList();
    } else {
      render();
    }
  }

  function dispose() {
    stopCapture();
    unsubConfigLoaded?.();
    unsubKeybindsChanged?.();
    buttons.clear();
    el.remove();
  }

  rebuildList();

  return {
    el,
    applyConfig,
    render,
    dispose,
  };
}
