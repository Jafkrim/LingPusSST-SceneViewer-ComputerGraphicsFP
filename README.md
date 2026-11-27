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
│       ├── models/        # Placeable 3D models (.glb, .gltf, .bin) & textures (.png, .jpg, .jpeg, .webp, .tga)
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
| | `--bg-modal-backdrop` | Dimmed backdrop behind the centered Settings modal dialog | `rgba(0, 0, 0, 0.68)` | `rgba(15, 23, 42, 0.45)` |
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
| **Content Browser** | `--cb-cat-folder` | Folder category badge & card accent | `#d99b26` | `#b45309` |
| | `--cb-cat-scene` | Scene (`.scene.json`) category badge & card accent | `#f97316` | `#c2410c` |
| | `--cb-cat-prefab` | Prefab (`.prefab.json`) category badge & card accent | `#ec4899` | `#be185d` |
| | `--cb-cat-exr` | EXR (`.exr`) environment map category badge & card accent | `#a855f7` | `#7e22ce` |
| | `--cb-cat-hdr` | HDR (`.hdr`) environment map category badge & card accent | `#10b981` | `#047857` |
| | `--cb-cat-glb` | Binary glTF (`.glb`) category badge & card accent | `#3b82f6` | `#1d4ed8` |
| | `--cb-cat-gltf` | JSON glTF (`.gltf`) category badge & card accent | `#06b6d4` | `#0e7490` |
| | `--cb-cat-binary` | glTF binary buffer (`.bin`) category badge & card accent | `#64748b` | `#475569` |
| | `--cb-cat-texture` | Strict texture (`.png`, `.jpg`, `.jpeg`, `.webp`, `.tga`) badge & card accent | `#ef4444` | `#dc2626` |

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
    "--bg-modal-backdrop": "rgba(0, 0, 0, 0.68)",
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
    "--viewport-axis-z": "#0000ff",
    "--cb-cat-folder": "#d99b26",
    "--cb-cat-scene": "#f97316",
    "--cb-cat-prefab": "#ec4899",
    "--cb-cat-exr": "#a855f7",
    "--cb-cat-hdr": "#10b981",
    "--cb-cat-glb": "#3b82f6",
    "--cb-cat-gltf": "#06b6d4",
    "--cb-cat-binary": "#64748b",
    "--cb-cat-texture": "#ef4444"
  }
}
```

### 4. Application Source Code (`src/`)

#### Configuration (`src/config/`)
```text
src/config/
├── cameraSettings.json   # Per-mode speeds, Sprint/Alt multipliers, FOV/distance limits, drone inertia/tilt, and roll recovery.
├── keybinds.json         # Default action-to-input mappings loaded by InputManager and resettable in Settings.
└── uiSettings.json       # Default UI scale, animations, pie menus, editor dock dimensions, viewport guides, and Content Browser rules.
```

#### Core Engine (`src/engine/`)
Core runtime systems decoupled from rendering styles, scene state, and UI components:
```text
src/engine/
├── assetResolver.js    # Live-watches engineContent/ and userContent/ manifests and routes extensions to loaders.
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
│   ├── droneController.js      # Quadcopter physics with 3D aim-aligned thrust, motor spool-up lag, rotational inertia, and yaw-turn banking.
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
│   ├── reflectionSystem.js            # Real-time/probe cubemaps blended with screen-space reflections (SSR) and planar/puddle surfaces.
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
├── panels/                           # Modular HUD control panels
│   ├── renderSections/               # Modular sub-sections mounted inside RenderPanel
│   │   └── viewportGuidesSection.js  # Toggles viewport grid and world XYZ axes visibility.
│   ├── contentBrowserPanel.js        # Content drawer with auto-compacting hierarchy, category filters, relevance search, and marquee multi-select.
│   ├── editorPanel.js                # Docked right-side panel hosting the Hierarchy tree and tabbed Inspector / Render panes.
│   ├── hierarchyPanel.js             # Scene outliner tree displaying active scene entities and selection state.
│   ├── inspectorPanel.js             # Edits transforms, material properties, and mesh stats for the selected object.
│   ├── pieMenuPanel.js               # Config-driven radial pie menus (Tab for panels, ` for camera projection).
│   ├── renderPanel.js                # Hosts modular render sections (viewport guides, render styles, lighting, post-processing).
│   ├── settingsPanel.js              # Centered modal managing UI theme, UI scale (80%–160%), camera settings, and keybinds.
│   ├── statsPanel.js                 # Displays real-time FPS, frame time, draw calls, triangles, GPU info, and GLSL versions.
│   └── viewportGizmoPanel.js         # Non-interactive top-right 3D axis orientation indicator.
├── themes/                           # Built-in theme presets and runtime JSON theme manager
│   ├── builtInDark.json              # Built-in dark CSS token preset.
│   ├── builtInLight.json             # Built-in light CSS token preset.
│   └── themeManager.js               # Discovers, switches, installs, and uninstalls JSON themes via CSS variables.
└── uiManager.js                      # Mounts HUD panels, initializes ThemeManager, enforces default refresh layout, and bridges events.
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

All camera controllers, viewport tools, and UI panels query **logical action IDs** from `InputManager` rather than hardcoded key literals. Default bindings live in `src/config/keybinds.json` and can be overridden at runtime via `settings:keybindsChanged`. Mouse bindings use **LMB**, **RMB**, and **Alt**-modified gestures (avoiding **MMB** for full laptop touchpad support).

#### Cursor & Controller Behavior Rules

* **Surveyor (`surveyorController.js`):** Hybrid viewport camera combining **Orbit** and **Fly** in one mode, plus smooth roll recovery (`rollRecoverySpeed`):
  * **Orbit State (Default / `RMB` Released):** Mouse cursor moves freely to hover and click objects. Without a selection (`target === null`), `Alt + LMB Drag` does nothing, `Alt + RMB Drag` hides/locks the cursor to pan across the screen plane using `fallbackPanDistance`, `Alt + Scroll` / pinch does nothing, and `F` does nothing. With a selected object/prefab, `Alt + LMB Drag` hides/locks the cursor to orbit around the target (`orbitSpeed`), `Alt + RMB Drag` hides/locks the cursor to pan both camera and target (`panSpeed`), `Alt + Scroll` or trackpad/touch pinch dollies near/far around the target (`dollySpeed`, accelerated by `Shift`), and `F` frames the selection (`defaultFocusDistance`).
  * **Fly State (`RMB` Held without `Alt`):** Captures and hides the cursor for free-look (`RMB` + mouse move) with `WASD` horizontal movement, `E`/`Q` vertical movement, `Shift` sprint, and `Alt` slow precision. Releasing `RMB` immediately returns to Orbit state and restores the cursor.
* **Drone (`droneController.js`):** Simulates quadcopter flight with velocity inertia (`horizontalAccel`, `verticalAccel`, `horizontalDrag`, `verticalDrag`), angular damping, pitch/roll banking into turns (`maxTiltDeg`, `tiltResponsiveness`), sphere collision bounce (`collisionRadius`, `collisionBounce`), and thrust along the drone's local forward, right, and tilted rotor `up` vector (`E`/`Q`). Automatically requests pointer lock on activation and `LMB` click, or looks while `RMB` is held; `Esc` releases pointer lock.
* **Walk (`walkController.js`):** First-person gravity movement (`WASD`, `Space` to jump when grounded via `spatialIndex.resolveWalk`) with smooth roll recovery. Contains no virtual floor at `y = 0`, allowing free-fall off edges until `spatialIndex.js` resolves collision with scene geometry. Requests pointer lock on activation and `LMB` click, or looks while `RMB` is held; `Esc` releases pointer lock.
* **FOV Zoom & Recovery (`baseController.js`):** Holding `C` (`camera.zoomIn`) or `Z` (`camera.zoomOut`) narrows or widens camera FOV (`fovZoomSpeed`, clamped between `minFov` and `maxFov`) in both **Orbit** and **Fly** states (as well as **Drone** and **Walk**). On release, FOV smoothly recovers back toward `defaultFov` (`fovRecoverySpeed`)—except during **Surveyor Fly** (`holdReturn = true`), which holds the zoomed FOV while `RMB` fly remains active and recovers once `RMB` is released.

#### Default Action Bindings (`src/config/keybinds.json`)

| Category | Logical Action ID | Default Input(s) | Behavior |
| :--- | :--- | :--- | :--- |
| **Mode Switching** | `camera.mode.surveyor` | `1` (`Digit1`) | Switch active controller to **Surveyor** (Hybrid Orbit/Fly). |
| | `camera.mode.drone` | `2` (`Digit2`) | Switch active controller to **Drone**. |
| | `camera.mode.walk` | `3` (`Digit3`) | Switch active controller to **Walk**. |
| **View Modes** | `view.mode.1` – `view.mode.6` | `4` – `9` (`Digit4`–`Digit9`) | Switch viewport rendering/diagnostic view mode (`Lit`, `Unlit`, `Wireframe`, `Lighting`, `Reflection`, `Collision`). |
| **Surveyor Orbit** | `camera.orbit.modifier` | `Alt` | Activates Orbit manipulation when `RMB` fly is not active. |
| | `camera.orbit.rotate` | `Alt + LMB Drag` | When an object is selected, hides/locks cursor and orbits around the target; does nothing when unselected. |
| | `camera.orbit.pan` | `Alt + RMB Drag` | Hides/locks cursor; pans camera (using `fallbackPanDistance`) or selected-object pivot across screen plane (`Shift` accelerates). |
| | *(Wheel / Pinch Dolly)* | `Alt + Scroll` / Pinch | When an object is selected, dollies camera near/far around target (`Shift` accelerates); does nothing when unselected. |
| | `camera.focus` | `F` (`KeyF`) | Frames the active selection at `defaultFocusDistance` or current distance (only active when an object/prefab is selected). |
| **Fly / Drone / Walk** | `camera.fly.engage` / `camera.look` | `RMB` (`Mouse2`) / Pointer Lock | Engages Fly mode in **Surveyor** (`RMB` without `Alt`) or rotates camera yaw/pitch while pointer is locked or `RMB` is held (**Drone**/**Walk**). |
| | `camera.moveForward` | `W` (`KeyW`) | Moves forward. |
| | `camera.moveBackward` | `S` (`KeyS`) | Moves backward. |
| | `camera.moveLeft` | `A` (`KeyA`) | Strafes left. |
| | `camera.moveRight` | `D` (`KeyD`) | Strafes right. |
| | `camera.moveUp` | `E` (`KeyE`) | Ascends vertically (**Surveyor Fly**) or thrusts along local rotor up-vector (**Drone**). |
| | `camera.moveDown` | `Q` (`KeyQ`) | Descends vertically (**Surveyor Fly**) or thrusts downward along local rotor up-vector (**Drone**). |
| | `camera.zoomIn` | `C` (`KeyC`) | Zooms in by narrowing camera FOV (`fovZoomSpeed`); recovers to `defaultFov` on release (held while in **Surveyor Fly**). |
| | `camera.zoomOut` | `Z` (`KeyZ`) | Zooms out by widening camera FOV (`fovZoomSpeed`); recovers to `defaultFov` on release (held while in **Surveyor Fly**). |
| | `camera.jump` | `Space` | Jumps when grounded (**Walk** mode only). |
| | `camera.sprint` | `Shift` | Applies per-mode `sprintMultiplier` to movement speed (and Surveyor pan/dolly speed) while held. |
| | `camera.slow` | `Alt` | Applies per-mode `slowMultiplier` to movement speed while held. |
| **Viewport Tools** | `tool.select` | `LMB` (`Mouse0`) | Raycasts and selects mesh via `selectionTool.js` in **Surveyor**, or re-locks cursor when clicked inside viewport in **Drone**/**Walk**. |
| | `tool.measure` | `M` (`KeyM`) | Toggles two-point surface distance tool (`measurementTool.js`). |
| | `tool.sectionCut` | `X` (`KeyX`) | Toggles interactive clipping plane (`sectionCutTool.js`, **Surveyor** mode only). |
| | `tool.cancel` | `Esc` (`Escape`) | Releases cursor lock in **Drone**/**Walk**, or clears selection/target and active tool in **Surveyor**. |
| **UI & Panels** | `ui.pie.panels` | `Tab` (`Tab`) | Opens radial pie menu to toggle **Statistics**, **Gizmo**, **Editor Panel**, and **Settings**. |
| | `ui.pie.camera` | `` ` `` (`Backquote`) | Opens radial pie menu to switch camera projection (**Perspective** / **Orthographic**). |
| | `ui.toggleHud` | `H` (`KeyH`) | Toggles Game Mode (hides/shows all HUD panels and viewport guides). |
| | `ui.toggleContentBrowser` | `Shift + Space` | Toggles Content Browser drawer (forces Surveyor mode on open; closes on viewport LMB/RMB click). |

## Development Progress

### Application Source Code (`src/`)
**Overall Progress:** `11 / 64` (**17.18%**)

| Module | Completed | Total | Progress |
| :--- | :---: | :---: | :---: |
| `src/config/` | 1 | 3 | **33.33%** |
| `src/engine/` | 0 | 5 | **0.00%** |
| `src/pawn/` | 5 | 5 | **100.00%** |
| `src/rendering/` | 1 | 24 | **4.16%** |
| `src/root/` | 1  | 3 | **33.33%** |
| `src/tools/` | 0 | 4 | **0.00%** |
| `src/ui/` | 3 | 14 | **21.42%** |
| `src/utils/` | 0 | 3 | **0.00%** |
| `src/world/` | 0 | 3 | **0.00%** |

#### File Implementation & Task Assignment
| File Path | Assigned NRP | Status |
| :--- | :---: | :---: |
| `src/config/cameraSettings.json` | `5025241040` | Done |
| `src/config/keybinds.json` | `5025241040` | WIP |
| `src/config/uiSettings.json` | `5025241040` | WIP |
| `src/engine/assetResolver.js` | `5025241040` | WIP |
| `src/engine/engine.js` | `5025241040` | WIP |
| `src/engine/eventBus.js` | `5025241040` | WIP |
| `src/engine/inputManager.js` | `5025241040` | WIP |
| `src/engine/resourceTracker.js` | `TBD` | Pending |
| `src/pawn/controllers/baseController.js` | `5025241040` | Done |
| `src/pawn/controllers/droneController.js` | `5025241040` | Done |
| `src/pawn/controllers/surveyorController.js` | `5025241040` | Done |
| `src/pawn/controllers/walkController.js` | `5025241040` | Done |
| `src/pawn/pawnManager.js` | `5025241040` | Done |
| `src/rendering/lighting/globalIlluminationSystem.js` | `TBD` | Pending |
| `src/rendering/lighting/lightingRig.js` | `5025241040` | WIP |
| `src/rendering/lighting/reflectionSystem.js` | `TBD` | Pending |
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
| `src/rendering/viewportGuides.js` | `5025241040` | Done |
| `src/root/index.html` | `5025241040` | Done |
| `src/root/main.js` | `5025241040` | WIP |
| `src/root/style.css` | `5025241040` | WIP |
| `src/tools/measurementTool.js` | `TBD` | Pending |
| `src/tools/placementTool.js` | `TBD` | Pending |
| `src/tools/sectionCutTool.js` | `TBD` | Pending |
| `src/tools/selectionTool.js` | `TBD` | Pending |
| `src/ui/panels/renderSections/viewportGuidesSection.js` | `5025241040` | WIP |
| `src/ui/panels/contentBrowserPanel.js` | `5025241040` | WIP |
| `src/ui/panels/editorPanel.js` | `5025241040` | WIP |
| `src/ui/panels/hierarchyPanel.js` | `5025241040` | WIP |
| `src/ui/panels/inspectorPanel.js` | `5025241040` | WIP |
| `src/ui/panels/pieMenuPanel.js` | `5025241040` | WIP |
| `src/ui/panels/renderPanel.js` | `5025241040` | WIP |
| `src/ui/panels/settingsPanel.js` | `5025241040` | WIP |
| `src/ui/panels/statsPanel.js` | `5025241040` | WIP |
| `src/ui/panels/viewportGizmoPanel.js` | `5025241040` | Done |
| `src/ui/themes/builtInDark.json` | `5025241040` | Done |
| `src/ui/themes/builtInLight.json` | `5025241040` | Done |
| `src/ui/themes/themeManager.js` | `5025241040` | WIP |
| `src/ui/uiManager.js` | `5025241040` | WIP |
| `src/utils/disposal.js` | `TBD` | Pending |
| `src/utils/math.js` | `TBD` | Pending |
| `src/utils/noise.js` | `TBD` | Pending |
| `src/world/sceneManager.js` | `5025241040` | WIP |
| `src/world/sceneSerializer.js` | `5025241040` | WIP |
| `src/world/spatialIndex.js` | `5025241040` | WIP |

### Engine Content (`public/engineContent/`)
**Overall Progress:** `0 / 4` (**0.00%**)

| Directory | Assigned NRP | Status |
| :--- | :---: | :---: |
| `public/engineContent/starterPack/environments/` | `TBD` | Pending |
| `public/engineContent/starterPack/models/` | `TBD` | Pending |
| `public/engineContent/starterPack/prefabs/` | `TBD` | Pending |
| `public/engineContent/starterPack/scenes/` | `TBD` | Pending |
