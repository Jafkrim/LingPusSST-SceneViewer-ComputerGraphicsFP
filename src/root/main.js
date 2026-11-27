import { Engine } from '@/engine/engine.js';
import { EventBus } from '@/engine/eventBus.js';
import { InputManager } from '@/engine/inputManager.js';
import { ResourceTracker } from '@/engine/resourceTracker.js';
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
import { BatchPoolManager } from '@/rendering/batchPoolManager.js';
import { SelectionTool } from '@/tools/selectionTool.js';
import { PlacementTool } from '@/tools/placementTool.js';

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

  window.addEventListener(
    'contextmenu',
    (e) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
    },
    { capture: true }
  );

  const eventBus = new EventBus();
  const engine = new Engine({ canvas, eventBus });

  const initialKeybinds = engine.getConfig('keybinds.json');
  const initialCameraSettings = engine.getConfig('cameraSettings.json');
  const initialUiSettings = engine.getConfig('uiSettings.json');

  const inputManager = new InputManager({
    target: canvas,
    eventBus,
    keybinds: initialKeybinds,
  });
  engine.register('inputManager', inputManager, 0);

  const resourceTracker = new ResourceTracker({ eventBus });
  engine.register('resourceTracker', resourceTracker, 2);

  const assetResolver = new AssetResolver({
    eventBus,
    resourceTracker,
    config: initialUiSettings.contentBrowser,
  });
  engine.register('assetResolver', assetResolver, 5);

  const sceneManager = new SceneManager({
    eventBus,
    defaultSceneName: initialUiSettings.sceneSave?.defaultFileName,
  });
  engine.register('sceneManager', sceneManager, 10);

  const spatialIndex = new SpatialIndex({ sceneManager, eventBus });
  engine.register('spatialIndex', spatialIndex, 15);

  const batchPool = new BatchPoolManager({
    scene: sceneManager.scene,
    eventBus,
  });
  sceneManager.batchPool = batchPool;
  engine.register('batchPool', batchPool, 12);

  const sceneSerializer = new SceneSerializer({
    sceneManager,
    assetResolver,
    eventBus,
    resourceTracker,
    batchPool,
    config: initialUiSettings.sceneSave,
  });
  engine.register('sceneSerializer', sceneSerializer, 16);

  const pawnManager = new PawnManager({
    eventBus,
    inputManager,
    aspect: engine.width / engine.height,
  });
  engine.register('pawnManager', pawnManager, 20);

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

  const lightingRig = new LightingRig({ scene: sceneManager.scene, eventBus });
  engine.register('lightingRig', lightingRig, 30);

  const viewportGuides = new ViewportGuides({ scene: sceneManager.scene, eventBus });
  engine.register('viewportGuides', viewportGuides, 35);

  const renderPipeline = new RenderPipeline({
    canvas,
    scene: sceneManager.scene,
    camera: pawnManager.camera,
    eventBus,
    viewportGuides,
  });
  engine.register('renderPipeline', renderPipeline, 100);

  renderPipeline.registerStyle('pr', new PRStyle({ pipeline: renderPipeline, eventBus }));
  renderPipeline.setStyle('pr');

  const uiManager = new UIManager({
    root: hudRoot,
    eventBus,
    renderPipeline,
    assetResolver,
    sceneManager,
    pawnManager,
    config: { ui: initialUiSettings },
  });
  engine.register('uiManager', uiManager, 110);

  const selectionTool = new SelectionTool({
    sceneManager,
    camera: pawnManager.camera,
    eventBus,
    batchPool,
    pawnManager,
    uiManager,
  });
  renderPipeline.selectionTool = selectionTool;
  engine.register('selectionTool', selectionTool, 115);

  const placementTool = new PlacementTool({
    canvas,
    sceneManager,
    sceneSerializer,
    assetResolver,
    camera: pawnManager.camera,
    eventBus,
    batchPool,
    selectionTool,
    pawnManager,
    uiManager,
    config: initialUiSettings,
  });
  engine.register('placementTool', placementTool, 116);

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
        sceneManager.setSceneNameFromFile(item.fileName ?? item.logicalPath);
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
    } else if (fileName === 'uiSettings.json') {
      if (data.contentBrowser) assetResolver.configure(data.contentBrowser);
      if (data.sceneSave) {
        sceneSerializer.configure(data.sceneSave);
        if (data.sceneSave.defaultFileName) {
          sceneManager.setSceneNameFromFile(data.sceneSave.defaultFileName);
        }
      }
    }
  });

  const isSceneActionAllowed = () => {
    if (uiManager.settingsPanel?.visible) return false;
    const allowedModes =
      initialUiSettings.sceneActions?.allowedModes ??
      sceneSerializer.saveConfig?.allowedModes ??
      ['surveyor'];
    return allowedModes.includes(pawnManager.activeMode);
  };

  const triggerSceneNew = () => {
    if (!isSceneActionAllowed()) return;
    sceneSerializer.newScene();
  };

  const triggerSceneSave = async () => {
    if (!isSceneActionAllowed()) return;

    try {
      const savedResult = await sceneSerializer.saveScene();
      const savedName = savedResult?.fileName ?? savedResult?.name;
      if (savedName) {
        sceneManager.setSceneNameFromFile(savedName);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to save scene:', err);
      }
    }
  };

  const triggerSceneLoad = async () => {
    if (!isSceneActionAllowed()) return;
    try {
      const loaded = await sceneSerializer.loadSceneFromDisk();
      const loadedName = loaded?.fileName ?? loaded?.name;
      if (loadedName) {
        sceneManager.setSceneNameFromFile(loadedName);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to load scene:', err);
      }
    }
  };

  eventBus.on('scene:requestLoadFromDisk', triggerSceneLoad);

  eventBus.on('input:action:down', ({ action } = {}) => {
    if (uiManager.settingsPanel?.visible) return;

    if (action === 'scene.new') {
      triggerSceneNew();
      return;
    }

    if (action === 'scene.load') {
      triggerSceneLoad();
      return;
    }

    if (action === 'scene.save') {
      triggerSceneSave();
      return;
    }

    if (action in CAMERA_MODE_ACTIONS) {
      pawnManager.setMode(CAMERA_MODE_ACTIONS[action]);
      return;
    }

    if (action in VIEW_MODE_ACTIONS) {
      eventBus.emit('view:setMode', { mode: VIEW_MODE_ACTIONS[action], action });
    }
  });

  eventBus.on('input:action:down', ({ action } = {}) => {
    if (uiManager.settingsPanel?.visible) return;

    if (action === 'scene.save') {
      triggerSceneSave();
      return;
    }

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
