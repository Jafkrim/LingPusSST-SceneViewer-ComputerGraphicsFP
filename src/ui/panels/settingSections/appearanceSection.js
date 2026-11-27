import defaultUiSettings from '@/config/uiSettings.json';

export function getTitle(config = defaultUiSettings) {
  return (
    config.settingsPanel?.sections?.appearance?.title ??
    defaultUiSettings.settingsPanel.sections.appearance.title
  );
}

export const title = getTitle(defaultUiSettings);

export function createSection({ eventBus, themeManager, config = defaultUiSettings }) {
  const getSectionCfg = (cfg = config) => ({
    ...defaultUiSettings.settingsPanel.sections.appearance,
    ...(cfg.settingsPanel?.sections?.appearance ?? {}),
  });

  let sectionCfg = getSectionCfg(config);

  const el = document.createElement('div');
  el.className = 'hud-ed__group';

  const heading = document.createElement('div');
  heading.className = 'hud-ed__group-title';
  heading.textContent = sectionCfg.title;
  el.appendChild(heading);

  // Theme row
  const themeRow = document.createElement('div');
  themeRow.className = 'hud-field';

  const themeLabel = document.createElement('label');
  themeLabel.className = 'hud-field__label';
  themeLabel.textContent = sectionCfg.themeLabel;
  themeLabel.htmlFor = 'hud-theme-select';

  const themeSelect = document.createElement('select');
  themeSelect.id = 'hud-theme-select';
  themeSelect.className = 'hud-select';

  const rebuildThemeOptions = () => {
    const activeId = themeManager?.activeThemeId;
    themeSelect.innerHTML = '';
    for (const theme of themeManager?.listThemes?.() ?? []) {
      const opt = document.createElement('option');
      opt.value = theme.id;
      opt.textContent = theme.name ?? theme.id;
      themeSelect.appendChild(opt);
    }
    if (activeId) {
      themeSelect.value = activeId;
    }
  };
  rebuildThemeOptions();

  themeSelect.addEventListener('change', () => {
    themeManager?.setTheme?.(themeSelect.value);
  });

  themeRow.append(themeLabel, themeSelect);

  // UI Scale row
  const scaleRow = document.createElement('div');
  scaleRow.className = 'hud-field';

  const scaleHeader = document.createElement('div');
  scaleHeader.className = 'hud-field__row';

  const scaleLabel = document.createElement('span');
  scaleLabel.className = 'hud-field__label';
  scaleLabel.textContent = sectionCfg.scaleLabel;

  const scaleValue = document.createElement('span');
  scaleValue.className = 'hud-field__value';

  scaleHeader.append(scaleLabel, scaleValue);

  const scaleBounds = {
    ...defaultUiSettings.uiScale,
    ...(config.uiScale ?? {}),
  };
  let scaleMin = Number(scaleBounds.min);
  let scaleMax = Number(scaleBounds.max);
  let scaleStep = Number(scaleBounds.step);
  let scaleCurrent = Number(scaleBounds.value);

  const sliderTrack = document.createElement('div');
  sliderTrack.className = 'hud-slider';
  sliderTrack.setAttribute('role', 'slider');
  sliderTrack.tabIndex = 0;
  sliderTrack.setAttribute('aria-label', sectionCfg.scaleLabel);
  sliderTrack.setAttribute('aria-valuemin', String(scaleMin));
  sliderTrack.setAttribute('aria-valuemax', String(scaleMax));

  const sliderFill = document.createElement('div');
  sliderFill.className = 'hud-slider__fill';

  const sliderThumb = document.createElement('div');
  sliderThumb.className = 'hud-slider__thumb';

  sliderTrack.append(sliderFill, sliderThumb);

  const renderSlider = (percent) => {
    scaleCurrent = Math.round(percent);
    const pctRatio = ((scaleCurrent - scaleMin) / Math.max(1, scaleMax - scaleMin)) * 100;
    scaleValue.textContent = `${scaleCurrent}%`;
    sliderTrack.setAttribute('aria-valuenow', String(scaleCurrent));
    sliderFill.style.width = `${pctRatio}%`;
    sliderThumb.style.left = `${pctRatio}%`;
  };
  renderSlider(scaleCurrent);

  let dragRect = null;
  const applyClientX = (clientX) => {
    if (!dragRect || dragRect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - dragRect.left) / dragRect.width));
    const raw = scaleMin + ratio * (scaleMax - scaleMin);
    const stepped = Math.round(raw / scaleStep) * scaleStep;
    const clamped = Math.min(scaleMax, Math.max(scaleMin, stepped));
    if (clamped !== scaleCurrent) {
      renderSlider(clamped);
      eventBus?.emit?.('ui:scaleChanged', { percent: clamped, scale: clamped / 100 });
    }
  };

  sliderTrack.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragRect = sliderTrack.getBoundingClientRect();
    sliderTrack.setPointerCapture(e.pointerId);
    applyClientX(e.clientX);
  });

  sliderTrack.addEventListener('pointermove', (e) => {
    if (dragRect && sliderTrack.hasPointerCapture(e.pointerId)) {
      applyClientX(e.clientX);
    }
  });

  const endDrag = (e) => {
    if (dragRect) {
      dragRect = null;
      if (sliderTrack.hasPointerCapture?.(e.pointerId)) {
        sliderTrack.releasePointerCapture(e.pointerId);
      }
    }
  };
  sliderTrack.addEventListener('pointerup', endDrag);
  sliderTrack.addEventListener('pointercancel', endDrag);

  sliderTrack.addEventListener('keydown', (e) => {
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = scaleStep;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -scaleStep;
    if (delta !== 0) {
      e.preventDefault();
      const next = Math.min(scaleMax, Math.max(scaleMin, scaleCurrent + delta));
      renderSlider(next);
      eventBus?.emit?.('ui:scaleChanged', { percent: next, scale: next / 100 });
    }
  });

  scaleRow.append(scaleHeader, sliderTrack);
  el.append(themeRow, scaleRow);

  const unsubThemeApplied = eventBus?.on?.('theme:applied', (payload = {}) => {
    const nextId = payload.id ?? payload.themeId ?? themeManager?.activeThemeId;
    if (nextId && themeSelect.value !== nextId) {
      themeSelect.value = nextId;
    }
  });

  const unsubThemeInstalled = eventBus?.on?.('theme:installed', () => {
    rebuildThemeOptions();
  });

  function render() {
    rebuildThemeOptions();
    renderSlider(scaleCurrent);
  }

  function applyConfig(nextConfig = {}) {
    sectionCfg = getSectionCfg(nextConfig);
    themeLabel.textContent = sectionCfg.themeLabel;
    scaleLabel.textContent = sectionCfg.scaleLabel;
    sliderTrack.setAttribute('aria-label', sectionCfg.scaleLabel);

    const nextBounds = {
      ...defaultUiSettings.uiScale,
      ...(nextConfig.uiScale ?? {}),
    };
    scaleMin = Number(nextBounds.min);
    scaleMax = Number(nextBounds.max);
    scaleStep = Number(nextBounds.step);
    sliderTrack.setAttribute('aria-valuemin', String(scaleMin));
    sliderTrack.setAttribute('aria-valuemax', String(scaleMax));
    renderSlider(nextBounds.value);
    rebuildThemeOptions();
  }

  function dispose() {
    unsubThemeApplied?.();
    unsubThemeInstalled?.();
    el.remove();
  }

  return {
    el,
    setUiScale: renderSlider,
    applyConfig,
    render,
    dispose,
  };
}
