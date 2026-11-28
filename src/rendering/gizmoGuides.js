import * as THREE from 'three';

function readThemeColor(cssVar, fallbackHex) {
  if (typeof window === 'undefined') return new THREE.Color(fallbackHex);
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return new THREE.Color(raw || fallbackHex);
}

export class GizmoGuides {
  constructor({ scene, eventBus, config = {} }) {
    if (!scene) throw new Error('GizmoGuides requires a THREE.Scene.');

    this.scene = scene;
    this.eventBus = eventBus ?? null;
    this.config = config;

    this.root = new THREE.Group();
    this.root.name = 'TransformGizmoRoot';
    this.root.visible = false;
    this.root.renderOrder = 999;
    this.root.userData.isViewportGuide = true;
    this.root.userData.excludeFromHierarchy = true;
    this.scene.add(this.root);

    this._modeGroups = {
      translate: new THREE.Group(),
      rotate: new THREE.Group(),
      scale: new THREE.Group(),
    };
    this.root.add(
      this._modeGroups.translate,
      this._modeGroups.rotate,
      this._modeGroups.scale
    );

    this._pickables = [];
    this._handleMeshes = new Map(); // handleId -> Array<{ mesh, baseOpacity, isPlane }>
    this._hoveredHandle = null;
    this._activeHandle = null;
    this._mode = 'none';

    this._colors = {
      x: new THREE.Color('#ff0000'),
      y: new THREE.Color('#00ff00'),
      z: new THREE.Color('#0000ff'),
      center: new THREE.Color('#e6e6e6'),
      hover: new THREE.Color('#ffbe3b'),
    };

    this._buildAllHandles();
    this.syncThemeColors();

    this._unsubs = [
      this.eventBus?.on?.('theme:applied', () => this.syncThemeColors()),
    ].filter(Boolean);
  }

  _makeMat(color, opacity = 1) {
    return new THREE.MeshBasicMaterial({
      color: color.clone(),
      transparent: opacity < 1,
      opacity,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
  }

  _registerPart(group, mesh, handleId, baseOpacity = 1, isPlane = false) {
    mesh.renderOrder = 999;
    mesh.userData.gizmoHandle = handleId;
    mesh.userData.isViewportGuide = true;
    mesh.userData.excludeFromHierarchy = true;
    group.add(mesh);
    this._pickables.push(mesh);

    if (!this._handleMeshes.has(handleId)) {
      this._handleMeshes.set(handleId, []);
    }
    this._handleMeshes.get(handleId).push({ mesh, baseOpacity, isPlane });
  }

  _buildAllHandles() {
    const planeOpacity = Number(this.config.planeOpacity ?? 0.28);

    const axes = [
      { id: 'X', dir: new THREE.Vector3(1, 0, 0), rot: new THREE.Euler(0, 0, -Math.PI / 2) },
      { id: 'Y', dir: new THREE.Vector3(0, 1, 0), rot: new THREE.Euler(0, 0, 0) },
      { id: 'Z', dir: new THREE.Vector3(0, 0, 1), rot: new THREE.Euler(Math.PI / 2, 0, 0) },
    ];

    // --- 1. TRANSLATE (Arrows + 3 Dual-Axis Plane Squares + Center Sphere) ---
    const tGroup = this._modeGroups.translate;
    const shaftGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.78, 12);
    const coneGeo = new THREE.ConeGeometry(0.068, 0.22, 16);
    const hitCylGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.96, 8);

    for (const ax of axes) {
      const shaft = new THREE.Mesh(shaftGeo, this._makeMat(this._colors[ax.id.toLowerCase()]));
      shaft.rotation.copy(ax.rot);
      shaft.position.copy(ax.dir).multiplyScalar(0.42);
      this._registerPart(tGroup, shaft, ax.id, 1);

      const cone = new THREE.Mesh(coneGeo, this._makeMat(this._colors[ax.id.toLowerCase()]));
      cone.rotation.copy(ax.rot);
      cone.position.copy(ax.dir).multiplyScalar(0.9);
      this._registerPart(tGroup, cone, ax.id, 1);

      const hit = new THREE.Mesh(hitCylGeo, this._makeMat(this._colors.center, 0.001));
      hit.rotation.copy(ax.rot);
      hit.position.copy(ax.dir).multiplyScalar(0.52);
      this._registerPart(tGroup, hit, ax.id, 0.001);
    }

    const planes = [
      { id: 'XY', pos: [0.24, 0.24, 0], rot: [0, 0, 0], colorKey: 'z' },
      { id: 'YZ', pos: [0, 0.24, 0.24], rot: [0, Math.PI / 2, 0], colorKey: 'x' },
      { id: 'XZ', pos: [0.24, 0, 0.24], rot: [-Math.PI / 2, 0, 0], colorKey: 'y' },
    ];
    const planeGeo = new THREE.PlaneGeometry(0.24, 0.24);
    for (const pl of planes) {
      const mesh = new THREE.Mesh(
        planeGeo,
        this._makeMat(this._colors[pl.colorKey], planeOpacity)
      );
      mesh.position.set(...pl.pos);
      mesh.rotation.set(...pl.rot);
      this._registerPart(tGroup, mesh, pl.id, planeOpacity, true);
    }

    const centerSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 16, 16),
      this._makeMat(this._colors.center, 0.95)
    );
    this._registerPart(tGroup, centerSphere, 'XYZ', 0.95);

    // --- 2. ROTATE (3 Orthogonal Torus Arcs + Outer Free-Rotate Ring) ---
    const rGroup = this._modeGroups.rotate;
    const torusGeo = new THREE.TorusGeometry(0.86, 0.022, 12, 64);
    const torusHitGeo = new THREE.TorusGeometry(0.86, 0.085, 8, 36);

    const ringDefs = [
      { id: 'X', rot: [0, Math.PI / 2, 0] },
      { id: 'Y', rot: [Math.PI / 2, 0, 0] },
      { id: 'Z', rot: [0, 0, 0] },
    ];
    for (const rg of ringDefs) {
      const ring = new THREE.Mesh(torusGeo, this._makeMat(this._colors[rg.id.toLowerCase()]));
      ring.rotation.set(...rg.rot);
      this._registerPart(rGroup, ring, rg.id, 1);

      const hit = new THREE.Mesh(torusHitGeo, this._makeMat(this._colors.center, 0.001));
      hit.rotation.set(...rg.rot);
      this._registerPart(rGroup, hit, rg.id, 0.001);
    }

    const freeBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 16, 16),
      this._makeMat(this._colors.center, 0.85)
    );
    this._registerPart(rGroup, freeBall, 'XYZ', 0.85);

    // --- 3. SCALE (Shafts + Cubes + Dual-Axis Plane Triangles + Center Uniform Cube) ---
    const sGroup = this._modeGroups.scale;
    const boxTipGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);

    for (const ax of axes) {
      const shaft = new THREE.Mesh(shaftGeo, this._makeMat(this._colors[ax.id.toLowerCase()]));
      shaft.rotation.copy(ax.rot);
      shaft.position.copy(ax.dir).multiplyScalar(0.42);
      this._registerPart(sGroup, shaft, ax.id, 1);

      const tip = new THREE.Mesh(boxTipGeo, this._makeMat(this._colors[ax.id.toLowerCase()]));
      tip.position.copy(ax.dir).multiplyScalar(0.88);
      this._registerPart(sGroup, tip, ax.id, 1);

      const hit = new THREE.Mesh(hitCylGeo, this._makeMat(this._colors.center, 0.001));
      hit.rotation.copy(ax.rot);
      hit.position.copy(ax.dir).multiplyScalar(0.52);
      this._registerPart(sGroup, hit, ax.id, 0.001);
    }

    for (const pl of planes) {
      const mesh = new THREE.Mesh(
        planeGeo,
        this._makeMat(this._colors[pl.colorKey], planeOpacity)
      );
      mesh.position.set(...pl.pos);
      mesh.rotation.set(...pl.rot);
      this._registerPart(sGroup, mesh, pl.id, planeOpacity, true);
    }

    const centerCube = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.16, 0.16),
      this._makeMat(this._colors.center, 0.95)
    );
    this._registerPart(sGroup, centerCube, 'XYZ', 0.95);
  }

  syncThemeColors() {
    this._colors.x = readThemeColor('--axis-x', '#ff0000');
    this._colors.y = readThemeColor('--axis-y', '#00ff00');
    this._colors.z = readThemeColor('--axis-z', '#0000ff');
    this._colors.center = readThemeColor('--text-primary', '#e6e6e6');
    this._colors.hover = readThemeColor('--status-warning', '#ffbe3b');
    this._refreshHandleAppearance();
  }

  _getHandleBaseColor(handleId) {
    if (handleId === 'X' || handleId === 'YZ') return this._colors.x;
    if (handleId === 'Y' || handleId === 'XZ') return this._colors.y;
    if (handleId === 'Z' || handleId === 'XY') return this._colors.z;
    return this._colors.center;
  }

  _refreshHandleAppearance() {
    const hoverOpacity = Number(this.config.hoverOpacity ?? 0.92);
    const active = this._activeHandle ?? this._hoveredHandle;

    for (const [handleId, entries] of this._handleMeshes.entries()) {
      const isHighlighted = active === handleId;
      const baseColor = isHighlighted ? this._colors.hover : this._getHandleBaseColor(handleId);

      for (const { mesh, baseOpacity, isPlane } of entries) {
        if (baseOpacity <= 0.01) continue; // invisible hit-proxy
        mesh.material.color.copy(baseColor);
        mesh.material.opacity = isHighlighted && isPlane ? hoverOpacity : baseOpacity;
        mesh.material.transparent = mesh.material.opacity < 1;
      }
    }
  }

  setMode(mode) {
    this._mode = mode;
    this._modeGroups.translate.visible = mode === 'translate';
    this._modeGroups.rotate.visible = mode === 'rotate';
    this._modeGroups.scale.visible = mode === 'scale';
  }

  setHighlightedHandle(hoveredHandle, activeHandle = null) {
    if (this._hoveredHandle === hoveredHandle && this._activeHandle === activeHandle) return;
    this._hoveredHandle = hoveredHandle;
    this._activeHandle = activeHandle;
    this._refreshHandleAppearance();
  }

  getActivePickables() {
    if (!this.root.visible || !this._modeGroups[this._mode]) return [];
    return this._pickables.filter((m) => m.parent === this._modeGroups[this._mode]);
  }

  updateTransform(targetObj, _camera, space = 'global') {
    if (!targetObj || this._mode === 'none') {
      this.root.visible = false;
      return;
    }

    this.root.visible = true;
    targetObj.updateWorldMatrix(true, false);
    targetObj.getWorldPosition(this.root.position);

    if (space === 'local') {
      targetObj.getWorldQuaternion(this.root.quaternion);
    } else {
      this.root.quaternion.identity();
    }

    const baseSize = Number(this.config.size ?? 1.15);
    this.root.scale.setScalar(baseSize);
  }

  dispose() {
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
    this.root.traverse((node) => {
      if (node.isMesh) {
        node.geometry?.dispose?.();
        node.material?.dispose?.();
      }
    });
    this.scene.remove(this.root);
  }
}
