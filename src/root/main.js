import { Engine } from '@/engine/engine.js';
import { EventBus } from '@/engine/eventBus.js';
import { InputManager } from '@/engine/inputManager.js';
import { AssetResolver } from '@/engine/assetResolver.js';
import { SceneManager } from '@/world/sceneManager.js';
import { SpatialIndex } from '@/world/spatialIndex.js';
import { SceneSerializer } from '@/world/sceneSerializer.js';
import { PawnManager } from '@/pawn/pawnManager.js';
import { SurveyorController } from '@/pawn/controllers/surveyorController.js';
import { DroneController } from '@/pawn/controllers/droneController.js';
import { WalkController } from '@/pawn/controllers/walkController.js';
import { LightingRig } from '@/rendering/lighting/lightingRig.js';
import { ViewportGuides } from '@/rendering/viewportGuides.js';
import { RenderPipeline } from '@/rendering/renderPipeline.js';
import { PRStyle } from '@/rendering/styles/prStyle.js';
import { UIManager } from '@/ui/uiManager.js';

const CAMERA_MODE_ACTIONS = Object.freeze({
  'camera.mode.surveyor': 'surveyor',
  'camera.mode.drone': 'drone',
  'camera.mode.walk': 'walk',
});

const VIEW_MODE_ACTIONS = Object.freeze({
  'view.mode.1': 1,
  'view.mode.2': 2,
  'view.mode.3': 3,
  'view.mode.4': 4,
  'view.mode.5': 5,
  'view.mode.6': 6,
});

function main() {
  const canvas = document.getElementById('viewport');
  const hudRoot = document.getElementById('hud-root');

  if (!canvas || !hudRoot) {
    throw new Error('Root DOM elements (#viewport, #hud-root) not found.');
  }

  const eventBus = new EventBus();
  const engine = new Engine({ canvas, eventBus });

  const initialKeybinds = engine.getConfig('keybinds.json');
  const initialCameraSettings = engine.getConfig('cameraSettings.json');
  const initialUiSettings = engine.getConfig('uiSettings.json');

  const inputManager = engine.register(
    'inputManager',
    new InputManager({ target: canvas, eventBus, keybinds: initialKeybinds }),
    0
  );

  const assetResolver = engine.register(
    'assetResolver',
    new AssetResolver({ eventBus }),
    5
  );

  const sceneManager = engine.register('sceneManager', new SceneManager({ eventBus }), 10);

  const spatialIndex = engine.register(
    'spatialIndex',
    new SpatialIndex({ sceneManager, eventBus }),
    15
  );

  const sceneSerializer = engine.register(
    'sceneSerializer',
    new SceneSerializer({ sceneManager, assetResolver, eventBus }),
    16
  );

  const pawnManager = engine.register(
    'pawnManager',
    new PawnManager({
      eventBus,
      inputManager,
      aspect: engine.width / engine.height,
    }),
    20
  );

  const controllerDeps = {
    manager: pawnManager,
    camera: pawnManager.camera,
    inputManager,
    eventBus,
    spatialIndex,
  };

  const surveyorController = new SurveyorController({
    ...controllerDeps,
    config: initialCameraSettings.surveyor,
  });
  const droneController = new DroneController({
    ...controllerDeps,
    config: initialCameraSettings.drone,
  });
  const walkController = new WalkController({
    ...controllerDeps,
    config: initialCameraSettings.walk,
  });

  pawnManager.registerController('surveyor', surveyorController);
  pawnManager.registerController('drone', droneController);
  pawnManager.registerController('walk', walkController);
  pawnManager.setMode('surveyor');

  engine.register('lightingRig', new LightingRig({ scene: sceneManager.scene, eventBus }), 30);

  const viewportGuides = engine.register(
    'viewportGuides',
    new ViewportGuides({ scene: sceneManager.scene, eventBus }),
    35
  );

  const renderPipeline = engine.register(
    'renderPipeline',
    new RenderPipeline({
      canvas,
      scene: sceneManager.scene,
      camera: pawnManager.camera,
      eventBus,
      viewportGuides,
    }),
    100
  );

  renderPipeline.registerStyle('pr', new PRStyle({ pipeline: renderPipeline, eventBus }));
  renderPipeline.setStyle('pr');

  const uiManager = engine.register(
    'uiManager',
    new UIManager({
      root: hudRoot,
      eventBus,
      renderPipeline,
      assetResolver,
      sceneManager,
      pawnManager,
      config: { ui: initialUiSettings },
    }),
    110
  );

  // Sync viewport dimensions and redraw immediately during panel slide animations
  eventBus.on('ui:viewportLayoutChanged', () => {
    const width = Math.max(1, Math.round(canvas.clientWidth || window.innerWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight || window.innerHeight));

    if (typeof engine.resize === 'function') {
      engine.resize(width, height);
    } else {
      pawnManager.setAspect?.(width / height);
      renderPipeline.resize?.(width, height);
    }

    renderPipeline.update?.(0, {
      engine,
      scene: sceneManager.scene,
      camera: pawnManager.camera,
    });
  });

  // Force Surveyor mode on open; close when clicking LMB/RMB on viewport
  eventBus.on('ui:contentBrowserVisibilityChanged', ({ visible } = {}) => {
    if (visible && pawnManager.activeMode !== 'surveyor') {
      pawnManager.setMode('surveyor');
    }
  });

  eventBus.on('input:pointerdown', ({ button } = {}) => {
    if (uiManager.settingsPanel?.visible) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (button === 0 || button === 2) {
      eventBus.emit('ui:closeContentBrowser');
    }
  });

  // Route double-clicked Content Browser items to scene/environment loaders
  eventBus.on('content:activateAsset', async (item) => {
    if (uiManager.settingsPanel?.visible) return;
    if (!item?.logicalPath) return;
    try {
      if (item.category === 'models' || item.category === 'prefabs') {
        await sceneSerializer.spawnEntityFromAsset(item.logicalPath);
      } else if (item.category === 'scenes') {
        await sceneSerializer.loadScene(item.logicalPath);
      } else if (item.category === 'environments') {
        eventBus.emit('environment:loadRequest', { logicalPath: item.logicalPath });
      }
    } catch (err) {
      console.error('Failed to activate content asset:', err);
    }
  });

  // Apply hydrated disk/folder/reset configs across subsystems
  eventBus.on('config:loaded', ({ fileName, data } = {}) => {
    if (!data) return;
    if (fileName === 'keybinds.json') {
      inputManager.setKeybinds(data);
    } else if (fileName === 'cameraSettings.json') {
      if (data.surveyor) surveyorController.configure(data.surveyor);
      if (data.drone) droneController.configure(data.drone);
      if (data.walk) walkController.configure(data.walk);
    }
  });

  eventBus.on('input:action:down', ({ action } = {}) => {
    if (uiManager.settingsPanel?.visible) return;

    if (action in CAMERA_MODE_ACTIONS) {
      pawnManager.setMode(CAMERA_MODE_ACTIONS[action]);
      return;
    }

    if (action in VIEW_MODE_ACTIONS) {
      eventBus.emit('view:setMode', { mode: VIEW_MODE_ACTIONS[action], action });
    }
  });

  assetResolver.refreshManifest().catch((err) => {
    console.warn('Content manifest discovery failed:', err);
  });

  const onBeforeUnload = (e) => {
    e.preventDefault();
    e.returnValue = '';
  };

  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('unload', () => engine.dispose(), { once: true });

  engine.start();
}

main();
