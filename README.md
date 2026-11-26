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
├── node_modules/       # Installed npm packages (external dependencies)
├── public/             # Engine & user content (zero-code auto-discovery)
├── src/                # Modular application source code organized by system domain
├── .gitattributes      # Enforces consistent line endings (LF) and marks binary assets across OSes
├── .gitignore          # Excludes node_modules, build output, and local scratch files from Git
├── LICENSE             # Repository software license terms
├── package-lock.json   # Locked dependency tree for reproducible installs across machines
├── package.json        # Project dependencies (three, three-mesh-bvh, vite) and npm scripts
├── README.md           # Technical Design Document (TDD), architecture rules, and setup guide
└── vite.config.js      # Vite dev/build config, root mapping, and path aliases
```

### 2. Static Content Packs (`public/`)
Assets placed inside `public/` follow a **convention-over-configuration** folder hierarchy so engine packs and custom user packs can be discovered without editing core engine logic.
```text
public/
├── engineContent/         # Built-in engine-shipped packs
│   └── starterPack/       # Default pack & structural template for custom user packs
│       ├── environments/  # Skybox HDRIs & Image-Based Lighting maps (.hdr, .exr)
│       ├── models/        # Placeable 3D models (.glb primary; .gltf in per-asset folder)
│       ├── prefabs/       # Reusable multi-mesh groups & furniture sets (.prefab.json)
│       ├── scenes/        # Saved scene layouts & lighting presets (.scene.json)
└── userContent/           # Custom user packs following the starterPack hierarchy
```

### 3. UI Theme Token Contract (`src/ui/themes/`)
HUD components in `src/ui/panels/` and viewport guides in `src/rendering/` must consume CSS custom properties defined in `src/root/style.css` and applied at runtime by `ThemeManager` (`builtInDark.json`, `builtInLight.json`, or auto-discovered `.json` theme files) instead of hardcoding hex or RGB values.

#### Color Tokens (Overridden by Themes)
| Category | Token | Role & Usage | `builtInDark` | `builtInLight` |
| :--- | :--- | :--- | :---: | :---: |
| **Surfaces** | `--bg-viewport` | Outer canvas backdrop & fallback scene background | `#1d1d1d` | `#e2e8f0` |
| | `--bg-panel` | Floating HUD panel containers | `#2b2b2b` | `#f8fafc` |
| | `--bg-panel-header` | Panel title bars, section headers, and tab strips | `#232323` | `#edf2f7` |
| | `--bg-input` | Text fields, numeric inputs, dropdowns, search bars, and sliders | `#383838` | `#ffffff` |
| | `--bg-hover` | Hover state for buttons, list rows, cards, and tree items | `#474747` | `#dbeafe` |
| | `--bg-overlay` | Dimmed backdrop behind modals and theme/scene dialogs | `rgba(0, 0, 0, 0.55)` | `rgba(15, 23, 42, 0.35)` |
| **Borders** | `--border-subtle` | Panel outer frames and section dividers | `#181818` | `#cbd5e1` |
| | `--border-widget` | Control borders for inputs, buttons, toggles, and selects | `#444444` | `#94a3b8` |
| **Text** | `--text-primary` | Main labels, active values, and headings | `#e6e6e6` | `#0f172a` |
| | `--text-secondary` | Field labels, secondary metadata, and inactive tabs | `#a6a6a6` | `#475569` |
| | `--text-muted` | Disabled controls, placeholders, and low-priority telemetry | `#737373` | `#64748b` |
| | `--text-on-accent` | Foreground text/icons over `--accent-primary` surfaces | `#ffffff` | `#ffffff` |
| **Accents** | `--accent-primary` | Active selections, primary buttons, and slider fills | `#4772b3` | `#2563eb` |
| | `--accent-primary-hover` | Hover state for primary accent buttons and active controls | `#5680c2` | `#1d4ed8` |
| **Semantic** | `--status-warning` | Performance/GPU warnings (e.g., high draw calls or iGPU limits) | `#d9822b` | `#d97706` |
| | `--status-danger` | Destructive actions, errors, and invalid theme/scene alerts | `#e04f5f` | `#dc2626` |
| **Axes & Grid** | `--axis-x` | X-axis indicator badge and gizmo accent | `#ff0000` | `#ff0000` |
| | `--axis-y` | Y-axis indicator badge and gizmo accent | `#00ff00` | `#00ff00` |
| | `--axis-z` | Z-axis indicator badge and gizmo accent | `#0000ff` | `#0000ff` |
| | `--viewport-grid-minor` | Minor `1m` grid lines (`ViewportGuides`) | `#525252` | `#cbd5e1` |
| | `--viewport-grid-major` | Major `10m` grid lines (`ViewportGuides`) | `#7a7a7a` | `#94a3b8` |
| | `--viewport-grid-opacity` | Grid and axis guide opacity (`0.0` – `1.0`) | `0.8` | `0.8` |
| | `--viewport-axis-x` | World X-axis guide line (`ViewportGuides`) | `#ff0000` | `#ff0000` |
| | `--viewport-axis-y` | World Y-axis guide line (`ViewportGuides`) | `#00ff00` | `#00ff00` |
| | `--viewport-axis-z` | World Z-axis guide line (`ViewportGuides`) | `#0000ff` | `#0000ff` |

#### Layout & Typography Tokens (Static Across Themes)
| Token | Role & Usage | Default Value |
| :--- | :--- | :--- |
| `--radius-sm` | Corner radius for inputs, badges, and compact buttons | `3px` |
| `--radius-md` | Corner radius for floating panels and modal dialogs | `4px` |
| `--font-ui` | UI labels, headers, buttons, and menus | `system-ui, -apple-system, 'Segoe UI', sans-serif` |
| `--font-mono` | Coordinates, IDs, shader info, and telemetry readouts | `ui-monospace, 'Cascadia Code', Consolas, monospace` |

#### Custom Theme Schema (`.json`)
Custom themes use a declarative **JSON** schema so external palettes can be validated safely without executing arbitrary JavaScript. Register themes at runtime via `themeManager.install(json)` or place `.json` files in `src/ui/themes/`:
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
    "--axis-x": "#ff0000",
    "--axis-y": "#00ff00",
    "--axis-z": "#0000ff",
    "--viewport-grid-minor": "#525252",
    "--viewport-grid-major": "#7a7a7a",
    "--viewport-grid-opacity": "0.8",
    "--viewport-axis-x": "#ff0000",
    "--viewport-axis-y": "#00ff00",
    "--viewport-axis-z": "#0000ff"
  }
}
```

### 4. Application Source Code (`src/`)

#### Configuration (`src/config/`)
```text
src/config/
├── cameraSettings.json   # Per-mode speeds, Sprint/Alt multipliers, FOV/distance limits, drone inertia/tilt, and roll recovery.
├── keybinds.json         # Default action-to-input mappings loaded by InputManager and resettable in Settings.
└── uiSettings.json       # Default UI preferences.
```

#### Core Engine (`src/engine/`)
Core runtime systems decoupled from rendering styles, scene state, and UI components:
```text
src/engine/
├── assetResolver.js    # Resolves logical paths across engineContent/ and userContent/ and routes extensions to loaders.
├── engine.js           # Runs the main frame loop, clamps delta time, handles viewport resizing, and registers subsystems.
├── eventBus.js         # Typed publish/subscribe hub for decoupled cross-module events.
├── inputManager.js     # Captures keyboard, pointer, wheel, and gesture input, also blocks browser zoom and buffers deltas.
└── resourceTracker.js  # Tracks allocated GPU resources (geometries, materials, textures) for clean disposal.
```

#### Camera & Movement (`src/pawn/`)
```text
src/pawn/
├── controllers/                # Swappable camera navigation modes driven by cameraSettings.json
│   ├── baseController.js       # Shared controller lifecycle and runtime settings:cameraChanged patch handler.
│   ├── droneController.js      # Quadcopter physics with local-body rotor thrust, banking tilt, and inertia damping.
│   ├── surveyorController.js   # RMB-hold Fly mode and RMB-up Alt-modified Orbit/Pan/Zoom.
│   └── walkController.js       # First-person gravity movement.
└── pawnManager.js              # Owns the active camera, switches controllers, and updates active navigation.
```

### Rendering Pipeline (`src/rendering/`)
Owns WebGL rendering, lighting, custom shaders, render styles, passes, dynamic weather, and viewport guides:

```text
src/rendering/
├── lighting/                          # Direct/indirect lighting, reflections, sky/IBL, and solar/lunar cycle
│   ├── globalIlluminationSystem.js    # Interval-updated real-time probes and screen-space indirect bounce.
│   ├── lightingRig.js                 # Sun/moon directional lights, ambient fill, and penumbra-capable shadow maps.
│   ├── reflectionProbeSystem.js       # Real-time/probe cubemaps blended with screen-space reflections (SSR) and planar/puddle surfaces.
│   ├── skyboxSystem.js                # Loads HDR/EXR maps, generates IBL PMREM, and renders procedural aurora sky domes.
│   └── timeOfDaySystem.js             # Computes sun/moon angles from lat/lon, date/time (Y-M-D H:M:S), and timezone offset.
├── passes/                            # Modular render, AO, debug buffer, and post-processing passes
│   ├── aoPass.js                      # Computes selectable ambient occlusion (SSAO/GTAO) into an AO buffer for lighting and debug view.
│   ├── basePass.js                    # Shared pass lifecycle (setup, render, resize, dispose).
│   ├── debugBufferPass.js             # Inspects buffers: Base Color, Metallic, Opacity, Roughness, Specular, World Normal, World Tangent, Scene Depth, AO, Velocity, Pre/Post-Tonemap HDR.
│   ├── outlinePass.js                 # Generates screen-space outlines for NPR mode.
│   ├── postProcessPass.js             # Runs TAA/FXAA, DoF, Motion Blur, Sun Rays, Bloom, Lens Flare/Dirt, Tone Mapping (AgX/ACES), Color Grading, Chromatic Aberration, Vignette, and Film Grain.
│   └── scenePass.js                   # Renders primary scene color, depth, normals/tangents, velocity, and G-buffer targets.
├── shaders/                           # Custom GLSL programs and shared uniform synchronization
│   ├── npr/                           # Non-photorealistic cel-shading material and GLSL shaders
│   │   ├── nprMaterial.js             # Builds cel-shaded materials while preserving base color and normal maps.
│   │   ├── toon.frag                  # Computes quantized diffuse bands, specular steps, and rim highlights.
│   │   └── toon.vert                  # Transforms normals and view vectors for toon shading.
│   └── shaderRegistry.js              # Synchronizes shared uniforms (time, sun/light dir, camera, wind, wetness) across shaders.
├── styles/                            # Swappable rendering and diagnostic view modes
│   ├── baseRenderStyle.js             # Shared style lifecycle (activate, deactivate, update, render).
│   ├── nprStyle.js                    # Cel-shaded rendering with crisp shadows and outlines.
│   ├── prStyle.js                     # PBR rendering with IBL, penumbra shadows, GI/SSR, and post-processing.
│   └── viewModeStyle.js               # Lit, Unlit, Wireframe (Opaque / Pass-Through), Lighting, Reflection, and Collision.
├── weather/                           # Weather states, precipitation, and surface accumulation
│   ├── lightningSystem.js             # Triggers procedural branching lightning bolts and storm flashes.
│   ├── surfaceWeatherPatch.js         # Patches materials for puddles, wetness roughness, rain ripples, and snow buildup.
│   └── weatherSystem.js               # Manages weather presets (clear, fog, rain, storm, snow, blizzard, dust), wind, precipitation, and auroras.
├── renderPipeline.js                  # Manages the WebGLRenderer, targets/passes, active style, and viewport resizing.
└── viewportGuides.js                  # Renders shader floor grid and world XYZ axes excluded from scene saves.
```

#### Entry Point (`src/root/`)
```text
src/root/
├── index.html    # HTML shell hosting the viewport canvas container and UI overlay mount points.
├── main.js       # Entry point that wires the engine, registers subsystems/tools, and starts the loop.
└── style.css     # Full-viewport layout rules and HUD styling backed by CSS custom properties.
```

#### Interactive Viewport Tools (`src/tools/`)
User-triggered tools for scene assembly, inspection, and measurement:
```text
src/tools/
├── measurementTool.js  # Picks two 3D surface points to compute and display real-world distance.
├── placementTool.js    # Spawns dragged models from the content browser with BVH surface and nearest-point snapping.
├── sectionCutTool.js   # Applies interactive clipping planes to slice geometry and inspect interiors.
└── selectionTool.js    # Runs BVH raycasting on pointer selection to select and highlight scene meshes.
```

#### User Interface (`src/ui/`)
DOM overlay panels decoupled from WebGL rendering logic and scene state:
```text
src/ui/
├── panels/                      # Modular HUD control panels
│   ├── contentBrowserPanel.js   # Browses engineContent/ and userContent/ assets and scene hierarchy items.
│   ├── inspectorPanel.js        # Edits transforms, material properties, and mesh stats for the selected object.
│   ├── renderPanel.js           # Controls render styles, time of day, render passes, and scene export actions.
│   ├── settingsPanel.js         # Manages graphics presets, post-processing toggles, and keybind settings.
│   └── statsPanel.js            # Displays real-time FPS, frame time, draw calls, triangles, GPU info, and GLSL versions.
├── themes/                      # Built-in theme presets and runtime JSON theme manager
│   ├── builtInDark.json         # Built-in dark CSS token preset.
│   ├── builtInLight.json        # Built-in light CSS token preset.
│   └── themeManager.js          # Discovers, switches, installs, and uninstalls JSON themes via CSS variables.
└── uiManager.js                 # Mounts HUD panels, initializes ThemeManager, and bridges UI actions via eventBus.
```

#### Shared Utilities (`src/utils/`)
Stateless helper functions reused across modules:
```text
src/utils/
├── disposal.js   # Stateless recursive helpers for disposing Three.js geometries, materials, and textures.
├── math.js       # Pure math helpers for clamping, interpolation, grid/nearest snapping, and solar angle math.
└── noise.js      # Deterministic 2D/3D procedural noise, fBm, and ripple generators for weather and surface effects.
```

#### Scene & Spatial Management (`src/world/`)
```text
src/world/
├── sceneManager.js     # Owns the active scene graph, entity lifecycle, viewport backdrop sync, and material caching.
├── sceneSerializer.js  # Serializes and restores .scene.json layouts.
└── spatialIndex.js     # Builds and maintains BVH acceleration structures for fast raycasting, snapping, and collision.
```

### 5. Controls & Rebindable Action Contract (`src/engine/inputManager.js` & `src/config/keybinds.json`)
All camera controllers, tools, and UI shortcuts query **logical action IDs** from `InputManager` rather than hardcoded key literals. Default bindings live in `src/config/keybinds.json` and can be overridden at runtime via `settings:keybindsChanged`. Mouse bindings use **LMB**, **RMB**, and **Alt**-modified gestures (avoiding **MMB** for full laptop touchpad support).

#### Cursor & Controller Behavior Rules
- **Surveyor (`surveyorController.js`):** Hybrid viewport camera combining **Orbit** and **Fly** in one mode:
  - **Orbit State (Default / RMB Released):** Mouse cursor moves freely to hover and click objects. Without a selection, `Alt + LMB Drag` rotates in-place, `Alt + RMB Drag` pans, `Alt + LMB + RMB Drag` or `Wheel` adjusts FOV, and `F` does nothing. With a selected object/prefab, `Alt` hides/locks the cursor for target-centric orbit (`Alt + LMB`), pan (`Alt + RMB`), dolly zoom (`Alt + LMB + RMB` / `Wheel`), and `F` frames the selection.
  - **Fly State (RMB Held without `Alt`):** Captures and hides the cursor for free-look (`RMB` + mouse move) with `WASD` horizontal movement, `E`/`Q` vertical movement, `Shift` sprint, and `Alt` slow precision. Releasing `RMB` immediately returns to Orbit state and restores the cursor.
- **Drone (`droneController.js`):** Simulates quadcopter flight with velocity inertia, pitch/roll banking into turns, and thrust along the drone's local forward, right, and tilted rotor `up` vector (`E`/`Q`).
- **Walk (`walkController.js`):** First-person gravity movement (`WASD`, `Space` to jump when grounded). Contains no virtual floor at `y = 0`, allowing free-fall off edges until `spatialIndex.js` resolves collision with scene geometry.

#### Default Action Bindings (`src/config/keybinds.json`)
| Category | Logical Action ID | Default Input(s) | Behavior |
| :--- | :--- | :--- | :--- |
| **Mode Switching** | `camera.mode.surveyor` | `1` (`Digit1`) | Switch active controller to **Surveyor** (Hybrid Orbit/Fly). |
| | `camera.mode.drone` | `2` (`Digit2`) | Switch active controller to **Drone**. |
| | `camera.mode.walk` | `3` (`Digit3`) | Switch active controller to **Walk**. |
| **View Modes** | `view.mode.1` – `view.mode.6` | `4` – `9` (`Digit4`–`Digit9`) | Switch viewport rendering/diagnostic view mode (`Lit`, `Unlit`, `Wireframe`, `Lighting`, `Reflection`, `Collision`). |
| **Surveyor Orbit** | `camera.orbit.modifier` | `Alt` (`AltLeft`, `AltRight`) | Activates Orbit manipulation when `RMB` fly is not active. |
| | `camera.orbit.rotate` | `Alt + LMB Drag` | Rotates camera in-place (unselected) or orbits around selected object. |
| | `camera.orbit.pan` | `Alt + RMB Drag` | Pans camera or selected-object pivot across screen plane. |
| | `camera.orbit.zoom` | `Alt + LMB + RMB Drag` / `Wheel` | Adjusts **FOV** (unselected) or dollies near/far around selected object. |
| | `camera.focus` | `F` (`KeyF`) | Frames the active selection (only active when an object/prefab is selected). |
| **Fly / Drone / Walk** | `camera.fly.engage` / `camera.look` | `RMB` (`Mouse2`) / Captured Pointer | Engages Fly mode in **Surveyor** and rotates camera yaw/pitch while cursor is captured. |
| | `camera.moveForward` | `W` (`KeyW`) | Moves forward. |
| | `camera.moveBackward` | `S` (`KeyS`) | Moves backward. |
| | `camera.moveLeft` | `A` (`KeyA`) | Strafes left. |
| | `camera.moveRight` | `D` (`KeyD`) | Strafes right. |
| | `camera.moveUp` | `E` (`KeyE`) | Ascends vertically (**Surveyor Fly**) or thrusts along local rotor up-vector (**Drone**). |
| | `camera.moveDown` | `Q` (`KeyQ`) | Descends vertically (**Surveyor Fly**) or thrusts downward along local rotor up-vector (**Drone**). |
| | `camera.jump` | `Space` | Jumps when grounded (**Walk** mode only). |
| | `camera.sprint` | `Shift` (`ShiftLeft`, `ShiftRight`) | Applies per-mode sprint speed multiplier while held. |
| | `camera.slow` | `Alt` (`AltLeft`, `AltRight`) | Applies per-mode slow multiplier while held. |
| **Viewport Tools** | `tool.select` | `LMB` (`Mouse0`) | Raycasts and selects mesh via `selectionTool.js` (or re-captures cursor when clicked in **Drone**/**Walk**). |
| | `tool.measure` | `M` (`KeyM`) | Toggles two-point surface distance tool (`measurementTool.js`). |
| | `tool.sectionCut` | `X` (`KeyX`) | Toggles interactive clipping plane (`sectionCutTool.js`, **Surveyor** mode only). |
| | `tool.cancel` | `Esc` (`Escape`) | Releases cursor lock in **Drone**/**Walk**, or cancels active tool/placement/selection in **Surveyor**. |
| **UI & Panels** | `ui.toggleHud` | `H` (`KeyH`) | Toggles Game Mode (hides/shows all HUD panels). |
| | `ui.toggleContentBrowser` | `Shift + Space` | Toggles Content Browser drawer. |
| | `ui.toggleSettings` | `\` (`Backslash`) | Toggles Settings panel (camera settings, keybinds, graphics presets, themes). |
| | `ui.toggleStats` | `]` (`BracketRight`) | Toggles real-time FPS / GPU performance overlay. |
| | `ui.cycleTheme` | `T` (`KeyT`) | Cycles active UI theme preset. |

## Development Progress

### Application Source Code (`src/`)
**Overall Progress:** `0 / 61` (**0.00%**)

| Module | Completed | Total | Progress |
| :--- | :---: | :---: | :---: |
| `src/config/` | 0 | 3 | **0.00%** |
| `src/engine/` | 0 | 5 | **0.00%** |
| `src/pawn/` | 0 | 5 | **0.00%** |
| `src/rendering/` | 0 | 24 | **0.00%** |
| `src/root/` | 0 | 3 | **0.00%** |
| `src/tools/` | 0 | 4 | **0.00%** |
| `src/ui/` | 0 | 11 | **0.00%** |
| `src/utils/` | 0 | 3 | **0.00%** |
| `src/world/` | 0 | 3 | **0.00%** |

#### File Implementation & Task Assignment
| File Path | Assigned NRP | Status |
| :--- | :---: | :---: |
| `src/config/cameraSettings.json` | `5025241040` | WIP |
| `src/config/keybinds.json` | `5025241040` | WIP |
| `src/config/uiSettings.json` | `5025241040` | WIP |
| `src/engine/assetResolver.js` | `TBD` | Pending |
| `src/engine/engine.js` | `5025241040` | WIP |
| `src/engine/eventBus.js` | `5025241040` | WIP |
| `src/engine/inputManager.js` | `5025241040` | WIP |
| `src/engine/resourceTracker.js` | `TBD` | Pending |
| `src/pawn/controllers/baseController.js` | `5025241040` | WIP |
| `src/pawn/controllers/droneController.js` | `5025241040` | WIP |
| `src/pawn/controllers/surveyorController.js` | `5025241040` | WIP |
| `src/pawn/controllers/walkController.js` | `5025241040` | WIP |
| `src/pawn/pawnManager.js` | `5025241040` | WIP |
| `src/rendering/lighting/globalIlluminationSystem.js` | `TBD` | Pending |
| `src/rendering/lighting/lightingRig.js` | `5025241040` | WIP |
| `src/rendering/lighting/reflectionProbeSystem.js` | `TBD` | Pending |
| `src/rendering/lighting/skyboxSystem.js` | `TBD` | Pending |
| `src/rendering/lighting/timeOfDaySystem.js` | `TBD` | Pending |
| `src/rendering/passes/aoPass.js` | `TBD` | Pending |
| `src/rendering/passes/basePass.js` | `TBD` | Pending |
| `src/rendering/passes/debugBufferPass.js` | `TBD` | Pending |
| `src/rendering/passes/outlinePass.js` | `TBD` | Pending |
| `src/rendering/passes/postProcessPass.js` | `TBD` | Pending |
| `src/rendering/passes/scenePass.js` | `TBD` | Pending |
| `src/rendering/shaders/npr/nprMaterial.js` | `TBD` | Pending |
| `src/rendering/shaders/npr/toon.frag` | `TBD` | Pending |
| `src/rendering/shaders/npr/toon.vert` | `TBD` | Pending |
| `src/rendering/shaders/shaderRegistry.js` | `TBD` | Pending |
| `src/rendering/styles/baseRenderStyle.js` | `5025241040` | WIP |
| `src/rendering/styles/nprStyle.js` | `TBD` | Pending |
| `src/rendering/styles/prStyle.js` | `5025241040` | WIP |
| `src/rendering/styles/viewModeStyle.js` | `TBD` | Pending |
| `src/rendering/weather/lightningSystem.js` | `TBD` | Pending |
| `src/rendering/weather/surfaceWeatherPatch.js` | `TBD` | Pending |
| `src/rendering/weather/weatherSystem.js` | `TBD` | Pending |
| `src/rendering/renderPipeline.js` | `5025241040` | WIP |
| `src/rendering/viewportGuides.js` | `5025241040` | WIP |
| `src/root/index.html` | `5025241040` | WIP |
| `src/root/main.js` | `5025241040` | WIP |
| `src/root/style.css` | `5025241040` | WIP |
| `src/tools/measurementTool.js` | `TBD` | Pending |
| `src/tools/placementTool.js` | `TBD` | Pending |
| `src/tools/sectionCutTool.js` | `TBD` | Pending |
| `src/tools/selectionTool.js` | `TBD` | Pending |
| `src/ui/panels/contentBrowserPanel.js` | `TBD` | Pending |
| `src/ui/panels/inspectorPanel.js` | `TBD` | Pending |
| `src/ui/panels/renderPanel.js` | `TBD` | Pending |
| `src/ui/panels/settingsPanel.js` | `5025241040` | WIP |
| `src/ui/panels/statsPanel.js` | `5025241040` | WIP |
| `src/ui/themes/builtInDark.json` | `5025241040` | WIP |
| `src/ui/themes/builtInLight.json` | `5025241040` | WIP |
| `src/ui/themes/themeManager.js` | `5025241040` | WIP |
| `src/ui/uiManager.js` | `5025241040` | WIP |
| `src/utils/disposal.js` | `TBD` | Pending |
| `src/utils/math.js` | `TBD` | Pending |
| `src/utils/noise.js` | `TBD` | Pending |
| `src/world/sceneManager.js` | `5025241040` | WIP |
| `src/world/sceneSerializer.js` | `TBD` | Pending |
| `src/world/spatialIndex.js` | `TBD` | Pending |

### Engine Content (`public/engineContent/`)
**Overall Progress:** `0 / 4` (**0.00%**)

| Directory | Assigned NRP | Status |
| :--- | :---: | :---: |
| `public/engineContent/starterPack/environments/` | `TBD` | Pending |
| `public/engineContent/starterPack/models/` | `TBD` | Pending |
| `public/engineContent/starterPack/prefabs/` | `TBD` | Pending |
| `public/engineContent/starterPack/scenes/` | `TBD` | Pending |
