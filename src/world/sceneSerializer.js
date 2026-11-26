import * as THREE from 'three';

export const PRIMITIVE_DEFAULTS = {
  plane: { width: 1, height: 1, widthSegments: 1, heightSegments: 1 },
  box: { width: 1, height: 1, depth: 1, widthSegments: 1, heightSegments: 1, depthSegments: 1 },
  sphere: { radius: 0.5, widthSegments: 32, heightSegments: 24 },
  cylinder: { radiusTop: 0.5, radiusBottom: 0.5, height: 1, radialSegments: 24, openEnded: false },
  cone: { radius: 0.5, height: 1, radialSegments: 24, openEnded: false },
  torus: { radius: 0.5, tube: 0.2, radialSegments: 16, tubularSegments: 48 },
  torusKnot: { radius: 0.5, tube: 0.16, tubularSegments: 96, radialSegments: 16, p: 2, q: 3 },
};

export class SceneSerializer {
  constructor({ sceneManager, assetResolver = null, eventBus = null }) {
    this.sceneManager = sceneManager;
    this.assetResolver = assetResolver;
    this.eventBus = eventBus;
    this.currentMeta = null;
  }

  buildGeometry(primitive, params = {}) {
    const p = { ...(PRIMITIVE_DEFAULTS[primitive] || {}), ...params };
    switch (primitive) {
      case 'plane':
        return new THREE.PlaneGeometry(p.width, p.height, p.widthSegments, p.heightSegments);
      case 'box':
        return new THREE.BoxGeometry(
          p.width,
          p.height,
          p.depth,
          p.widthSegments,
          p.heightSegments,
          p.depthSegments
        );
      case 'sphere':
        return new THREE.SphereGeometry(p.radius, p.widthSegments, p.heightSegments);
      case 'cylinder':
        return new THREE.CylinderGeometry(
          p.radiusTop,
          p.radiusBottom,
          p.height,
          p.radialSegments,
          1,
          p.openEnded
        );
      case 'cone':
        return new THREE.ConeGeometry(p.radius, p.height, p.radialSegments, 1, p.openEnded);
      case 'torus':
        return new THREE.TorusGeometry(p.radius, p.tube, p.radialSegments, p.tubularSegments);
      case 'torusKnot':
        return new THREE.TorusKnotGeometry(
          p.radius,
          p.tube,
          p.tubularSegments,
          p.radialSegments,
          p.p,
          p.q
        );
      default:
        throw new Error(`Unsupported primitive type: ${primitive}`);
    }
  }

  buildMaterial(matData = {}) {
    return new THREE.MeshStandardMaterial({
      color: matData.color ?? '#cccccc',
      roughness: matData.roughness ?? 0.5,
      metalness: matData.metalness ?? 0.0,
      wireframe: Boolean(matData.wireframe),
    });
  }

  spawnPrimitive(primitive, params = {}, position = [0, 0, 0], options = {}) {
    const mergedParams = { ...(PRIMITIVE_DEFAULTS[primitive] || {}), ...params };
    const geometry = this.buildGeometry(primitive, mergedParams);
    const material = this.buildMaterial(options.material);
    const mesh = new THREE.Mesh(geometry, material);

    const id = options.id || `${primitive}_${crypto.randomUUID().slice(0, 8)}`;
    mesh.name = options.name || `${primitive[0].toUpperCase() + primitive.slice(1)}`;
    mesh.position.fromArray(position);
    if (Array.isArray(options.rotation)) mesh.rotation.fromArray(options.rotation);
    if (Array.isArray(options.scale)) mesh.scale.fromArray(options.scale);

    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = options.receiveShadow ?? true;
    mesh.userData.sceneId = id;
    mesh.userData.primitive = primitive;
    mesh.userData.primitiveParams = mergedParams;

    this._addToScene(mesh);
    return mesh;
  }

  updatePrimitiveParams(mesh, newParams = {}) {
    const primitive = mesh?.userData?.primitive;
    if (!primitive) return false;

    const nextParams = { ...(mesh.userData.primitiveParams || {}), ...newParams };
    const nextGeo = this.buildGeometry(primitive, nextParams);
    mesh.geometry?.dispose();
    mesh.geometry = nextGeo;
    mesh.userData.primitiveParams = nextParams;
    return true;
  }

  _addToScene(obj) {
    if (!obj?.isObject3D) return;
    const id = obj.userData?.sceneId || obj.uuid;
    if (typeof this.sceneManager.addObject === 'function') {
      this.sceneManager.addObject(id, obj);
    } else if (this.sceneManager.scene) {
      this.sceneManager.scene.add(obj);
    }
  }

  async loadFromUrl(url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load scene from ${url} (${res.status})`);
    }
    const sceneData = await res.json();
    return this.loadScene(sceneData);
  }

  async loadSceneFromFile(file) {
    const text = await file.text();
    const sceneData = JSON.parse(text);
    return this.loadScene(sceneData);
  }

  async loadScene(sceneData) {
    if (typeof this.sceneManager.clear === 'function') {
      this.sceneManager.clear();
    }

    this.currentMeta = {
      name: sceneData.name ?? 'Untitled Scene',
      description: sceneData.description ?? '',
      environment: sceneData.environment ?? {},
      camera: sceneData.camera ?? {},
    };

    for (const entry of sceneData.objects || []) {
      if (entry.primitive) {
        this.spawnPrimitive(entry.primitive, entry.params, entry.position, entry);
      } else if (entry.asset && this.assetResolver?.load) {
        const obj = await this.assetResolver.load(entry.asset);
        if (obj) {
          const id = entry.id || crypto.randomUUID().slice(0, 8);
          obj.name = entry.name || id;
          obj.userData.sceneId = id;
          obj.userData.assetPath = entry.asset;
          if (Array.isArray(entry.position)) obj.position.fromArray(entry.position);
          if (Array.isArray(entry.rotation)) obj.rotation.fromArray(entry.rotation);
          if (Array.isArray(entry.scale)) obj.scale.fromArray(entry.scale);
          this._addToScene(obj);
        }
      }
    }

    this.eventBus?.emit('scene:loaded', {
      meta: this.currentMeta,
      environment: this.currentMeta.environment,
      camera: this.currentMeta.camera,
    });

    return this.currentMeta;
  }

  _serializeObject3D(obj) {
    const id = obj.userData?.sceneId || obj.uuid;
    const base = {
      id,
      name: obj.name || id,
      position: obj.position.toArray(),
      rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
      scale: obj.scale.toArray(),
      castShadow: Boolean(obj.castShadow),
      receiveShadow: Boolean(obj.receiveShadow),
    };

    if (obj.userData?.primitive) {
      const mat = obj.material;
      return {
        ...base,
        primitive: obj.userData.primitive,
        params: { ...(obj.userData.primitiveParams || {}) },
        material: mat
          ? {
              color: `#${mat.color.getHexString()}`,
              roughness: mat.roughness ?? 0.5,
              metalness: mat.metalness ?? 0.0,
            }
          : undefined,
      };
    }

    if (obj.userData?.assetPath) {
      return { ...base, asset: obj.userData.assetPath };
    }

    return null;
  }

  serializeScene(meta = {}) {
    const objects = [];
    const root = this.sceneManager?.scene;

    if (root) {
      for (const child of root.children) {
        if (child.userData?.excludeFromSave) continue;
        const entry = this._serializeObject3D(child);
        if (entry) objects.push(entry);
      }
    }

    return {
      version: '1.0',
      name: meta.name ?? this.currentMeta?.name ?? 'Untitled Scene',
      description: meta.description ?? this.currentMeta?.description ?? '',
      environment: {
        renderStyle: meta.environment?.renderStyle ?? this.currentMeta?.environment?.renderStyle ?? 'pr',
        skybox: meta.environment?.skybox ?? this.currentMeta?.environment?.skybox ?? null,
        timeOfDay: {
          date: '2026-06-21T15:30:00+07:00',
          timezoneOffset: 7,
          latitude: -7.2575,
          longitude: 112.7521,
          ...(this.currentMeta?.environment?.timeOfDay || {}),
          ...(meta.environment?.timeOfDay || {}),
        },
        weather: meta.environment?.weather ?? this.currentMeta?.environment?.weather ?? 'clear',
      },
      camera: {
        mode: 'orbit',
        position: [0, 3.5, 9],
        target: [0, 1.2, 0],
        fov: 60,
        near: 0.1,
        far: 2000,
        ...(this.currentMeta?.camera || {}),
        ...(meta.camera || {}),
      },
      objects,
    };
  }

  saveSceneToFile(filename = 'scene.scene.json', meta = {}) {
    const payload = JSON.stringify(this.serializeScene(meta), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.scene.json') ? filename : `${filename}.scene.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
