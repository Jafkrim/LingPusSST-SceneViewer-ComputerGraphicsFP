import { Engine } from '@/engine/engine.js';
import { EventBus } from '@/engine/eventBus.js';
import { InputManager } from '@/engine/inputManager.js';
import { SceneManager } from '@/world/sceneManager.js';
import { PawnManager } from '@/pawn/pawnManager.js';
import { SurveyorController } from '@/pawn/controllers/surveyorController.js';
import { DroneController } from '@/pawn/controllers/droneController.js';
import { WalkController } from '@/pawn/controllers/walkController.js';
import { LightingRig } from '@/rendering/lighting/lightingRig.js';
import { ViewportGuides } from '@/rendering/viewportGuides.js';
import { RenderPipeline } from '@/rendering/renderPipeline.js';
import { PRStyle } from '@/rendering/styles/prStyle.js';
import { UIManager } from '@/ui/uiManager.js';
import defaultKeybinds from '@/config/keybinds.json';
import defaultCameraSettings from '@/config/cameraSettings.json';

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
  const inputManager = engine.register(
    'inputManager',
    new InputManager({ target: canvas, eventBus, keybinds: defaultKeybinds }),
    0
  );

  const sceneManager = engine.register('sceneManager', new SceneManager({ eventBus }), 10);

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
  };

  pawnManager.registerController(
    'surveyor',
    new SurveyorController({ ...controllerDeps, config: defaultCameraSettings.surveyor })
  );
  pawnManager.registerController(
    'drone',
    new DroneController({ ...controllerDeps, config: defaultCameraSettings.drone })
  );
  pawnManager.registerController(
    'walk',
    new WalkController({ ...controllerDeps, config: defaultCameraSettings.walk })
  );
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

  engine.register(
    'uiManager',
    new UIManager({ root: hudRoot, eventBus, renderPipeline }),
    110
  );

  eventBus.on('input:action:down', ({ action } = {}) => {
    if (action in CAMERA_MODE_ACTIONS) {
      pawnManager.setMode(CAMERA_MODE_ACTIONS[action]);
      return;
    }

    if (action in VIEW_MODE_ACTIONS) {
      eventBus.emit('view:setMode', { mode: VIEW_MODE_ACTIONS[action], action });
    }
  });

  window.addEventListener('beforeunload', () => engine.dispose(), { once: true });
  engine.start();
}

main();
