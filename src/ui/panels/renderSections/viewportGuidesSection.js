import defaultUiSettings from '@/config/uiSettings.json';

export const title = 'Viewport Guides';

const GUIDE_ITEMS = [
  { key: 'grid', label: 'Grid' },
  { key: 'axisX', label: 'Axis X' },
  { key: 'axisY', label: 'Axis Y' },
  { key: 'axisZ', label: 'Axis Z' },
];

export function createSection({ eventBus, config = defaultUiSettings }) {
  let guides = {
    ...defaultUiSettings.viewportGuides,
    ...(config.viewportGuides ?? {}),
  };
  config.viewportGuides = guides;

  const inputs = new Map();

  const el = document.createElement('div');
  el.className = 'hud-ed__group';

  const heading = document.createElement('div');
  heading.className = 'hud-ed__group-title';
  heading.textContent = title;
  el.appendChild(heading);

  for (const item of GUIDE_ITEMS) {
    const row = document.createElement('label');
    row.className = 'hud-ed__check-row';

    const nameEl = document.createElement('span');
    nameEl.textContent = item.label;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(guides[item.key]);
    checkbox.addEventListener('change', () => {
      guides[item.key] = checkbox.checked;
      config.viewportGuides = { ...guides };
      eventBus?.emit?.('viewport:guidesChanged', { ...guides });
    });

    inputs.set(item.key, checkbox);
    row.append(nameEl, checkbox);
    el.appendChild(row);
  }

  function render() {
    for (const [key, input] of inputs.entries()) {
      input.checked = Boolean(guides[key]);
    }
  }

  function applyConfig(nextConfig = {}) {
    const patch = nextConfig.viewportGuides ?? nextConfig;
    if (!patch || typeof patch !== 'object') return;
    guides = {
      ...guides,
      ...patch,
    };
    config.viewportGuides = { ...guides };
    render();
  }

  function dispose() {
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
