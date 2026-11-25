import { Engine } from '@/engine/engine.js';
import { SceneManager } from '@/world/sceneManager.js';
import { PawnManager } from '@/pawn/pawnManager.js';
import { RenderPipeline } from '@/rendering/renderPipeline.js';
import { UiManager } from '@/ui/uiManager.js';

const canvas = document.getElementById('viewport');
const hudRoot = document.getElementById('hud-root');

const engine = new Engine(canvas);

// 1. World & Camera
const sceneManager = engine.register('sceneManager', new SceneManager(engine.eventBus));
const pawnManager = engine.register(
    'pawnManager',
    new PawnManager(canvas, engine.eventBus, engine.width / engine.height)
);

// 2. WebGL Renderer & Visual Styles
const renderPipeline = engine.register(
    'renderPipeline',
    new RenderPipeline(canvas, sceneManager.scene, pawnManager.camera, engine.eventBus)
);

// 3. DOM HUD Overlay & Theme Engine
engine.register('uiManager', new UiManager(hudRoot, engine.eventBus, renderPipeline));

// 4. Start Main Loop
engine.start();
