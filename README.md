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

### 3. UI Theme Token Contract (`src/ui/themes/`)
All HUD panels in `src/ui/panels/` must reference CSS custom properties defined in `src/root/style.css` and dynamically overridden by `ThemeManager` (`builtInDark.js`, `builtInWhite.js`, or custom `.json` theme packs) rather than hardcoding hex or RGB colors.

#### Color Tokens (Overridden by Themes)
| Category | Token | Purpose & UI Panel Usage | `builtInDark` | `builtInWhite` |
| :--- | :--- | :--- | :---: | :---: |
| **Surfaces** | `--bg-viewport` | Fallback page backdrop & WebGL `scene.background` sync (`SceneManager`) | `#1d1d1d` | `#e5e7eb` |
| | `--bg-panel` | Floating panel containers (`StatsPanel`, `InspectorPanel`, `RenderPanel`, `ContentBrowserPanel`) | `#2b2b2b` | `#f3f4f6` |
| | `--bg-panel-header` | Collapsible panel title bars, section headers, and tab strips | `#232323` | `#e5e7eb` |
| | `--bg-input` | Text fields, numeric scrubbers, dropdowns, search bars, and sliders | `#383838` | `#ffffff` |
| | `--bg-hover` | Hover highlight for buttons, list rows, asset thumbnails, and tree items | `#474747` | `#d1d5db` |
| | `--bg-overlay` | Backdrop dimming for theme installer or scene export modal dialogs | `rgba(0, 0, 0, 0.55)` | `rgba(15, 23, 42, 0.35)` |
| **Borders** | `--border-subtle` | Outer panel borders and internal section dividers | `#181818` | `#cbd5e1` |
| | `--border-widget` | Interactive control borders (buttons, inputs, dropdowns, checkboxes) | `#444444` | `#94a3b8` |
| **Text** | `--text-primary` | Primary labels, active values, and panel titles | `#e6e6e6` | `#111827` |
| | `--text-secondary` | Property labels, inactive tabs, and secondary metadata | `#a6a6a6` | `#4b5563` |
| | `--text-muted` | Disabled options, placeholder text, and low-priority hardware telemetry | `#737373` | `#6b7280` |
| | `--text-on-accent` | High-contrast text and icons rendered inside active `--accent-primary` buttons | `#ffffff` | `#ffffff` |
| **Accents** | `--accent-primary` | Active tool buttons, selected hierarchy rows, and slider fills | `#4772b3` | `#2563eb` |
| | `--accent-primary-hover` | Hover state for primary accent buttons and active toggles | `#5680c2` | `#1d4ed8` |
| **Semantic** | `--status-warning` | Integrated GPU / high draw-call performance warnings (`StatsPanel`) | `#d9822b` | `#d97706` |
| | `--status-danger` | Destructive actions (delete mesh, uninstall theme) and invalid JSON alerts | `#e04f5f` | `#dc2626` |
| **3D Axes** | `--axis-x` | X-axis transform badge & gizmo indicator (`InspectorPanel`) | `#ff3352` | `#dc2626` |
| | `--axis-y` | Y-axis transform badge & gizmo indicator (`InspectorPanel`) | `#8bdc00` | `#16a34a` |
| | `--axis-z` | Z-axis transform badge & gizmo indicator (`InspectorPanel`) | `#2890ff` | `#2563eb` |

#### Layout & Typography Tokens (Static Across Themes)
| Token | Purpose & UI Panel Usage | Default Value |
| :--- | :--- | :--- |
| `--radius-sm` | Compact corners on inputs, badges, and small buttons | `3px` |
| `--radius-md` | Outer corners on floating HUD panels and modal dialogs | `4px` |
| `--font-ui` | Standard interface labels, headers, and buttons | `system-ui, -apple-system, 'Segoe UI', sans-serif` |
| `--font-mono` | Numeric coordinates, hex IDs, shader info, and performance counters | `ui-monospace, 'Cascadia Code', Consolas, monospace` |

#### Custom JSON Theme Schema
Users can install external themes at runtime via `themeManager.install(json)` using this structure:
```json
{
   "id": "custom-theme-id",
   "name": "Custom Theme Name",
   "tokens": {
      "--bg-viewport": "#1d1d1d",
      "--bg-panel": "#2b2b2b",
      "--bg-panel-header": "#232323",
      "--bg-input": "#383838",
      "--bg-hover": "#474747",
      "--bg-overlay": "rgba(0, 0, 0, 0.55)",
      "--border-subtle": "#181818",
      "--border-widget": "#444444",
      "--text-primary": "#e6e6e6",
      "--text-secondary": "#a6a6a6",
      "--text-muted": "#737373",
      "--text-on-accent": "#ffffff",
      "--accent-primary": "#4772b3",
      "--accent-primary-hover": "#5680c2",
      "--status-warning": "#d9822b",
      "--status-danger": "#e04f5f",
      "--axis-x": "#ff3352",
      "--axis-y": "#8bdc00",
      "--axis-z": "#2890ff"
   }
}
```

### 4. Application Source Code (`src/`)

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
│   └── viewModeStyle.js      # Diagnostic modes (Lit, Unlit, Wireframe [X-Ray/Opaque], Lighting, Reflection, Collision, and G-buffers).
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
├── themes/                      # Modular UI theme palettes and runtime installer
│   ├── builtInDark.js           # Built-in dark slate CSS token palette.
│   ├── builtInWhite.js          # Built-in high-contrast light/white CSS token palette.
│   └── themeManager.js          # Applies, switches, installs, and uninstalls custom JSON UI themes via CSS variables.
└── uiManager.js                 # Mounts HUD panels, initializes ThemeManager, and connects UI interactions to eventBus.
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
## Development Progress

### Application Source Code (`src/`)
**Overall Progress:** `15 / 47` (**31.91%**)

| Module | Completed | Total | Progress |
| :--- | :---: | :---: | :---: |
| `src/engine/` | 2 | 5 | **40.00%** |
| `src/pawn/` | 1 | 5 | **20.00%** |
| `src/rendering/` | 3 | 17 | **17.64%** |
| `src/root/` | 3 | 3 | **100.00%** |
| `src/tools/` | 0 | 4 | **0.00%** |
| `src/ui/` | 5 | 8 | **62.50%** |
| `src/utils/` | 0 | 2 | **0.00%** |
| `src/world/` | 1 | 3 | **33.33%** |

#### File Implementation & Task Assignment
| File Path | Assigned NRP | Status |
| :--- | :---: | :---: |
| `src/engine/assetResolver.js` | `TBD` | Pending |
| `src/engine/engine.js` | `5025241040` | Done |
| `src/engine/eventBus.js` | `5025241040` | Done |
| `src/engine/inputManager.js` | `TBD` | Pending |
| `src/engine/resourceTracker.js` | `TBD` | Pending |
| `src/pawn/controllers/baseController.js` | `TBD` | Pending |
| `src/pawn/controllers/droneController.js` | `TBD` | Pending |
| `src/pawn/controllers/orbitController.js` | `TBD` | Pending |
| `src/pawn/controllers/walkController.js` | `TBD` | Pending |
| `src/pawn/pawnManager.js` | `5025241040` | Done |
| `src/rendering/lighting/lightingRig.js` | `TBD` | Pending |
| `src/rendering/lighting/skyboxSystem.js` | `TBD` | Pending |
| `src/rendering/lighting/timeOfDaySystem.js` | `TBD` | Pending |
| `src/rendering/passes/basePass.js` | `TBD` | Pending |
| `src/rendering/passes/debugBufferPass.js` | `TBD` | Pending 
| `src/rendering/passes/outlinePass.js` | `TBD` | Pending |
| `src/rendering/passes/postProcessPass.js` | `TBD` | Pending |
| `src/rendering/passes/scenePass.js` | `TBD` | Pending |
| `src/rendering/shaders/npr/nprMaterial.js` | `TBD` | Pending |
| `src/rendering/shaders/npr/toon.frag` | `TBD` | Pending |
| `src/rendering/shaders/npr/toon.vert` | `TBD` | Pending |
| `src/rendering/shaders/shaderRegistry.js` | `TBD` | Pending |
| `src/rendering/styles/baseRenderStyle.js` | `5025241040` | Done |
| `src/rendering/styles/nprStyle.js` | `TBD` | Pending |
| `src/rendering/styles/prStyle.js` | `5025241040` | Done |
| `src/rendering/styles/viewModeStyle.js` | `TBD` | Pending |
| `src/rendering/renderPipeline.js` | `5025241040` | Done |
| `src/root/index.html` | `5025241040` | Done |
| `src/root/main.js` | `5025241040` | Done |
| `src/root/style.css` | `5025241040` | Done |
| `src/tools/measurementTool.js` | `TBD` | Pending |
| `src/tools/placementTool.js` | `TBD` | Pending |
| `src/tools/sectionCutTool.js` | `TBD` | Pending |
| `src/tools/selectionTool.js` | `TBD` | Pending |
| `src/ui/panels/contentBrowserPanel.js` | `TBD` | Pending |
| `src/ui/panels/inspectorPanel.js` | `TBD` | Pending |
| `src/ui/panels/renderPanel.js` | `TBD` | Pending |
| `src/ui/panels/statsPanel.js` | `5025241040` | Done |
| `src/ui/themes/builtInDark.js` | `5025241040` | Done |
| `src/ui/themes/builtInWhite.js` | `5025241040` | Done |
| `src/ui/themes/themeManager.js` | `5025241040` | Done |
| `src/ui/uiManager.js` | `5025241040` | Done |
| `src/utils/disposal.js` | `TBD` | Pending |
| `src/utils/math.js` | `TBD` | Pending |
| `src/world/sceneManager.js` | `5025241040` | Done |
| `src/world/sceneSerializer.js` | `TBD` | Pending |
| `src/world/spatialIndex.js` | `TBD` | Pending |

### Engine Content (`public/engineContent/`)
**Overall Progress:** `0 / 4` (**0.00%**)

| Directory | Assigned NRP | Status |
| :--- | :---: | :---: |
| `public/engineContent/starterPack/environments/` | `TBD` | Pending |
| `public/engineContent/starterPack/meshes/` | `TBD` | Pending |
| `public/engineContent/starterPack/scenes/` | `TBD` | Pending |
| `public/engineContent/starterPack/textures/` | `TBD` | Pending |
