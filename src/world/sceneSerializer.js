import * as THREE from 'three';

const SCENE_SCHEMA_VERSION = 1;

function serializeTransform(object3D) {
  return {
    position: object3D.position.toArray(),
    rotation: [object3D.rotation.x, object3D.rotation.y, object3D.rotation.z],
    scale: object3D.scale.toArray(),
  };
}

function applyTransform(object3D, transform = {}) {
  if (Array.isArray(transform.position) && transform.position.length === 3) {
    object3D.position.fromArray(transform.position);
  }
  if (Array.isArray(transform.rotation) && transform.rotation.length === 3) {
    object3D.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
  }
  if (Array.isArray(transform.scale) && transform.scale.length === 3) {
    object3D.scale.fromArray(transform.scale);
  }
}

export class SceneSerializer {
  constructor({ sceneManager, assetResolver, eventBus }) {
    if (!sceneManager || !assetResolver) {
      throw new Error('SceneSerializer requires sceneManager and assetResolver.');
    }

    this.sceneManager = sceneManager;
    this.assetResolver = assetResolver;
    this.eventBus = eventBus ?? null;
    this._currentEnvironment = null;

    this._unsubs = [
      this.eventBus?.on?.('environment:changed', ({ logicalPath } = {}) => {
        this._currentEnvironment = logicalPath ?? null;
      }),
    ].filter(Boolean);
  }

  serializeScene({ name = 'Untitled Scene' } = {}) {
    const entities = [];

    for (const [id, entry] of this.sceneManager.entities.entries()) {
      const { object, metadata } = entry;
      entities.push({
        id,
        name: object.name || metadata?.name || id,
        logicalPath: metadata?.logicalPath ?? null,
        category: metadata?.category ?? 'models',
        transform: serializeTransform(object),
        metadata: { ...metadata },
      });
    }

    return {
      version: SCENE_SCHEMA_VERSION,
      name,
      environment: this._currentEnvironment,
      entities,
    };
  }

  async spawnEntityFromAsset(logicalPath, options = {}) {
    const meta = this.assetResolver.getAssetMeta(logicalPath);
    const lower = logicalPath.toLowerCase();
    const id = options.id ?? `entity_${crypto.randomUUID().slice(0, 8)}`;

    if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
      const gltf = await this.assetResolver.loadAsset(logicalPath);
      const root = gltf.scene.clone(true);
      root.name = options.name ?? meta?.name ?? id;
      applyTransform(root, options.transform);

      return this.sceneManager.addEntity(id, root, {
        name: root.name,
        logicalPath,
        category: 'models',
        ...(options.metadata ?? {}),
      });
    }

    if (lower.endsWith('.prefab.json')) {
      const prefabData = await this.assetResolver.loadAsset(logicalPath);
      const group = new THREE.Group();
      group.name = options.name ?? prefabData.name ?? meta?.name ?? id;
      applyTransform(group, options.transform);

      for (const child of prefabData.children ?? []) {
        if (!child.logicalPath) continue;
        const childGltf = await this.assetResolver.loadAsset(child.logicalPath);
        const childMesh = childGltf.scene.clone(true);
        childMesh.name = child.name ?? 'PrefabPart';
        applyTransform(childMesh, child.transform);
        group.add(childMesh);
      }

      return this.sceneManager.addEntity(id, group, {
        name: group.name,
        logicalPath,
        category: 'prefabs',
        ...(options.metadata ?? {}),
      });
    }

    throw new Error(`Cannot spawn unsupported asset type: "${logicalPath}"`);
  }

  async loadScene(sceneDataOrPath) {
    const data =
      typeof sceneDataOrPath === 'string'
        ? await this.assetResolver.loadAsset(sceneDataOrPath)
        : sceneDataOrPath;

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid scene payload.');
    }

    this.sceneManager.clearEntities();

    if (data.environment) {
      this._currentEnvironment = data.environment;
      this.eventBus?.emit?.('environment:loadRequest', { logicalPath: data.environment });
    }

    for (const item of data.entities ?? []) {
      if (!item.logicalPath) continue;
      await this.spawnEntityFromAsset(item.logicalPath, {
        id: item.id,
        name: item.name,
        transform: item.transform,
        metadata: item.metadata,
      });
    }

    this.eventBus?.emit?.('scene:loaded', {
      name: data.name ?? 'Loaded Scene',
      count: data.entities?.length ?? 0,
    });
  }

  dispose() {
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
  }
}
