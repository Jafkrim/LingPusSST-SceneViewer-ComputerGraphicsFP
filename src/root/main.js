import { Engine } from '@/engine/engine.js';
import { InputManager } from '@/engine/inputManager.js';
import { SceneManager } from '@/world/sceneManager.js';
import { SceneSerializer } from '@/world/sceneSerializer.js';
import { PawnManager } from '@/pawn/pawnManager.js';
import { LightingRig } from '@/rendering/lighting/lightingRig.js';
import { RenderPipeline } from '@/rendering/renderPipeline.js';
import { UiManager } from '@/ui/uiManager.js';
import { ViewportGuides } from '@/rendering/viewportGuides.js';

const canvas = document.getElementById('viewport');
const hudRoot = document.getElementById('hud-root');

const engine = new Engine(canvas);
const inputManager = engine.register('inputManager', new InputManager(canvas));

// 1. World & Camera
const sceneManager = engine.register('sceneManager', new SceneManager(engine.eventBus));
const sceneSerializer = engine.register(
  'sceneSerializer',
  new SceneSerializer({ sceneManager, assetResolver: null, eventBus: engine.eventBus })
);

const pawnManager = engine.register(
  'pawnManager',
  new PawnManager(canvas, engine.eventBus, engine.width / engine.height, inputManager)
);

// 2. WebGL Renderer, Lighting & Visual Styles
engine.register('lightingRig', new LightingRig(sceneManager.scene, engine.eventBus));
engine.register('viewportGuides', new ViewportGuides(sceneManager.scene, engine.eventBus));

const renderPipeline = engine.register(
  'renderPipeline',
  new RenderPipeline(canvas, sceneManager.scene, pawnManager.camera, engine.eventBus)
);

// 3. DOM HUD Overlay & Theme Engine
const uiManager = engine.register('uiManager', new UiManager(hudRoot, engine.eventBus, renderPipeline));

// 4. Load Default Calibration World & Start Main Loop
await sceneSerializer.loadFromUrl('/engineContent/starterPack/scenes/basicShapeTest.scene.json');
engine.start();

// TEMP: Press 'T' to cycle through all discovered themes
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 't' && !e.repeat) {
    uiManager.themeManager.cycle();
  }
});
