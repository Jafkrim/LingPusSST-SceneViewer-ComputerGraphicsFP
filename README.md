# LingPusSST's Scene Viewer
A Three.js scene viewer built for the Computer Graphics C (2026) final project.

## Team 8 - LingPusSST
| NRP | Member Name |
| :--- | :--- |
| 5025241040 | Ja'far Balyan Al Karim |
| 5025241107 | Muhammad Zahran Rizki Primanda |
| 5025241111 | Hanif Aqil Janardana |
| 5025241223 | Muhammad Akhdan Alwaafy |

## Installation
1. **Install prerequisites:** Ensure [Node.js](https://nodejs.org/) (v18 or newer) is installed on your system.
2. **Clone the repository:**
   ```bash
   git clone https://github.com/Jafkrim/LingPusSST-SceneViewer-ComputerGraphicsFP.git
   ```
3. **Navigate to the project directory:**
   ```bash
   cd LingPusSST-SceneViewer-ComputerGraphicsFP
   ```
4. **Install dependencies:**
   ```bash
   npm install
   ```

## Run
Start the local development server:
```bash
npm run dev
```

## About the Project
A modular, extensible 3D scene viewer built on Three.js and Vite, designed with strict separation of concerns between core engine lifecycle management, swappable rendering styles (Photorealistic PBR and Non-Photorealistic Cel-Shading), BVH-accelerated spatial interaction, and zero-code content pack loading.

### 1. Top-Level Overview
```text
LingPusSST-SceneViewer-ComputerGraphicsFP/
├── node_modules/       # Installed npm packages (excluded from Git via .gitignore)
├── public/             # Static 3D assets, textures, HDRIs, and scene layouts (zero-code auto-discovery)
├── src/                # Modular application source code
├── .gitattributes      # Enforces consistent line endings (LF) and binary asset handling across OSes
├── .gitignore          # Excludes build artifacts, dependencies, and local environment files from Git
├── LICENSE             # Repository software license terms
├── package-lock.json   # Locked dependency tree ensuring consistent installs across machines
├── package.json        # Project dependencies (three, three-mesh-bvh, vite) and npm scripts
├── README.md           # Project documentation and setup guide
└── vite.config.js      # Vite build configuration, root entry mapping, and path aliases
```

### 2. Static Content Packs (`public/`)
Assets placed inside `public/` follow a **convention-over-configuration** folder hierarchy. Vite automatically scans these directories so new models, textures, skyboxes, and scenes appear in the UI without modifying JavaScript.
```text
public/
├── engineContent/
│   └── starterPack/       # Built-in default pack & blueprint template for custom user packs
│       ├── environments/  # Skybox HDRIs & Image-Based Lighting maps (.hdr, .exr)
│       ├── meshes/        # Placeable 3D models (.glb, .gltf)
│       ├── scenes/        # Saved scene layouts & lighting presets (.scene.json)
│       └── textures/      # Surface material maps (.png, .jpg, .webp)
└── userContent/           # Create custom pack folders here following the starterPack hierarchy above
```
### 3. Application Source Code (`src/`)

#### Core Engine (`src/engine/`)
Core framework systems decoupled from rendering styles and UI components:
```text
src/engine/
├── assetResolver.js    # Auto-discovers files in engineContent/ and userContent/ and maps extensions to their respective asset loaders.
├── engine.js           # Runs the main frame loop, tracks delta time, handles viewport resizing, and registers subsystems.
├── eventBus.js         # Central publish/subscribe messaging system for decoupled module communication.
├── inputManager.js     # Tracks keyboard, mouse, scroll wheel, and pointer-lock states for user input.
└── resourceTracker.js  # Tracks loaded GPU assets and disposes of unused geometries, materials, and textures to free memory.
```

#### Camera & Movement (`src/pawn/`)
```text
src/pawn/
├── controllers/              # Swappable camera navigation modes
│   ├── baseController.js     # Base interface (activate, deactivate, update) shared by all camera controllers.
│   ├── droneController.js    # 6-DOF free-fly camera (WASD + vertical thrust + speed boost) without floor constraints.
│   ├── orbitController.js    # Mouse orbit, pan, and zoom camera with focus-on-selected object support.
│   └── walkController.js     # First-person WASD + pointer-lock movement with gravity and BVH collision.
└── pawnManager.js            # Manages the active camera controller and forwards user input states each frame.
```

#### Rendering Pipeline (`src/rendering/`)
Manages WebGL rendering, visual styles, post-processing, lighting, and shaders:
```text
src/rendering/
├── lighting/                 # Illumination, skyboxes, and diurnal cycle
│   ├── lightingRig.js        # Manages directional sun/moon lights, ambient fill, and shadow maps.
│   ├── skyboxSystem.js       # Loads HDR environment maps for sky rendering and image-based lighting reflections.
│   └── timeOfDaySystem.js    # Simulates a 24-hour sun cycle, updating sun elevation, light color, and sky gradients.
├── passes/                   # Modular post-processing and buffer passes
│   ├── basePass.js           # Base interface (setup, render, resize, dispose) for render passes.
│   ├── debugBufferPass.js    # Displays raw render buffers (depth, normals, ambient occlusion) directly in the viewport.
│   ├── outlinePass.js        # Edge-detection pass generating screen-space ink outlines for nprStyle.
│   ├── postProcessPass.js    # Applies final post-processing effects such as bloom, tone mapping, and anti-aliasing.
│   └── scenePass.js          # Renders the primary 3D scene color and depth buffers.
├── shaders/                  # Custom GLSL shaders and uniform synchronization
│   ├── npr/                  # Non-Photorealistic Rendering (cel-shading) materials and GLSL shader programs
│   │   ├── nprMaterial.js    # Builds cel-shaded materials while preserving original model base color and normal maps.
│   │   ├── toon.frag         # Fragment shader computing quantized diffuse light bands, specular steps, and rim highlights.
│   │   └── toon.vert         # Vertex shader preparing surface normals and view directions for toon shading.
│   └── shaderRegistry.js     # Synchronizes global uniforms (uTime, uLightDir, uCameraPos) across custom materials.
├── styles/                   # Swappable visual rendering modes
│   ├── baseRenderStyle.js    # Base contract (activate, deactivate, render, update) implemented by all render modes.
│   ├── nprStyle.js           # Non-Photorealistic Rendering (NPR) mode using cel-shaded materials, crisp shadows, and ink outlines.
│   ├── prStyle.js            # Photorealistic mode using PBR materials, tone mapping, soft shadows, IBL, and post-processing.
│   └── viewModeStyle.js      # Diagnostic inspection modes (Wireframe, Unlit, Lighting-Only, Reflections, Normals, and Ambient Occlusion).
└── renderPipeline.js         # Manages the WebGL renderer and effect composer, executing the active render style and resize updates.
```

#### Entry Point (`src/root/`)
```text
src/root/
├── index.html    # Main HTML shell hosting the WebGL viewport canvas and UI overlay containers.
├── main.js       # Application entry point that initializes the engine, registers subsystems, and starts the main loop.
└── style.css     # Defines full-viewport layout and HUD panel styling.
```

#### Interactive Viewport Tools (`src/tools/`)
User-triggered tools for scene assembly, inspection, and measurement:
```text
src/tools/
├── measurementTool.js  # Lets the user pick two 3D surface points to measure real-world distance.
├── placementTool.js    # Handles drag-and-drop model spawning from the content browser with BVH surface and nearest-point snapping.
├── sectionCutTool.js   # Provides interactive clipping planes to slice through models and inspect internal geometry.
└── selectionTool.js    # Performs BVH raycasting on click to select and highlight scene meshes.
```

#### User Interface (`src/ui/`)
DOM overlay panels decoupled from WebGL rendering logic:
```text
src/ui/
├── panels/                      # Modular UI control panels
│   ├── contentBrowserPanel.js   # Browses available engineContent/ and userContent/ assets alongside the active scene hierarchy.
│   ├── inspectorPanel.js        # Displays and edits transform values, mesh statistics, and material properties of the selected object.
│   ├── renderPanel.js           # Provides controls for switching render styles, adjusting time of day, toggling passes, and exporting scenes.
│   └── statsPanel.js            # Displays real-time FPS, frame time, draw calls, and active triangle counts.
└── uiManager.js                 # Mounts HUD panels and connects user interface interactions to eventBus.
```

#### Shared Utilities (`src/utils/`)
Stateless helper functions reused across modules:
```text
src/utils/
├── disposal.js   # Recursive cleanup helper for freeing Three.js geometries, materials, and textures from GPU memory.
└── math.js       # Math utilities for clamping, interpolation, grid/nearest snapping, and solar angle calculations.
```

#### Scene & Spatial Management (`src/world/`)
```text
src/world/
├── sceneManager.js     # Manages the active 3D scene graph, object lifecycle, and original material caching across style switches.
├── sceneSerializer.js  # Saves and loads scene configurations (object transforms, asset paths, render style, and time of day) as .scene.json.
└── spatialIndex.js     # Builds BVH acceleration structures on loaded meshes for fast raycasting, snapping, and collision queries.
```
