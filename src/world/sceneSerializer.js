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
 constructor({
    sceneManager,
    assetResolver,
    eventBus,
    resourceTracker = null,
    batchPool = null,
    config = {},
  }) {
    if (!sceneManager || !assetResolver) {
      throw new Error('SceneSerializer requires sceneManager and assetResolver.');
    }

    this.sceneManager = sceneManager;
    this.assetResolver = assetResolver;
    this.eventBus = eventBus ?? null;
    this.resourceTracker = resourceTracker;
    this.batchPool = batchPool;
    this.saveConfig = {
      defaultDirectory: '',
      defaultName: 'untitled',
      extension: '.scene.json',
      allowedModes: ['surveyor'],
      ...(config ?? {}),
    };

    this._currentEnvironment = null;
    this._activeSceneLogicalPath = null;
    this._currentEnvironment = null;
    this._activeSceneLogicalPath = null;
    this._sceneOpToken = 0;

    this._unsubs = [
      this.eventBus?.on?.('environment:changed', ({ logicalPath } = {}) => {
        this._currentEnvironment = logicalPath ?? null;
      }),
    ].filter(Boolean);
  }

  configure(saveConfig = {}) {
    this.saveConfig = { ...this.saveConfig, ...saveConfig };
  }

  _ensureSceneExtension(fileNameOrPath) {
    const ext = String(this.saveConfig.extension ?? '.scene.json');
    const raw = String(fileNameOrPath ?? '').trim();
    if (!raw) return `${this.saveConfig.defaultName}${ext}`;
    if (raw.toLowerCase().endsWith(ext.toLowerCase())) return raw;
    if (raw.toLowerCase().endsWith('.json')) {
      return `${raw.slice(0, -'.json'.length)}${ext}`;
    }
    return `${raw}${ext}`;
  }

  getDefaultSaveLogicalPath() {
    if (this._activeSceneLogicalPath) {
      return this._activeSceneLogicalPath;
    }
    const dir = String(this.saveConfig.defaultDirectory ?? '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
    const baseName = String(this.saveConfig.defaultName ?? 'untitled').trim() || 'untitled';
    const fileName = this._ensureSceneExtension(baseName);
    return dir ? `${dir}/${fileName}` : fileName;
  }

  serializeScene({ name } = {}) {
    const fallbackName = String(this.saveConfig.defaultName ?? 'untitled');
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
      name: name ?? fallbackName,
      environment: this._currentEnvironment,
      entities,
    };
  }

  async saveScene({ logicalPath, name } = {}) {
    const targetPath = this._ensureSceneExtension(
      logicalPath ?? this.getDefaultSaveLogicalPath()
    );
    const ext = String(this.saveConfig.extension ?? '.scene.json');
    const cleanFile = targetPath.split('/').pop() ?? '';
    const sceneName =
      name ??
      (cleanFile.toLowerCase().endsWith(ext.toLowerCase())
        ? cleanFile.slice(0, -ext.length)
        : cleanFile || this.saveConfig.defaultName);

    const payload = this.serializeScene({ name: sceneName });
    const savedLogicalPath = await this.assetResolver.saveSceneToPublic(targetPath, payload);
    this._activeSceneLogicalPath = savedLogicalPath;

    const savedFileName = savedLogicalPath.split('/').pop() ?? `${sceneName}${ext}`;
    const resolvedName = savedFileName.toLowerCase().endsWith(ext.toLowerCase())
      ? savedFileName.slice(0, -ext.length)
      : sceneName;

    this.eventBus?.emit?.('scene:saved', {
      logicalPath: savedLogicalPath,
      fileName: savedFileName,
      name: resolvedName,
      count: payload.entities.length,
    });

    return savedLogicalPath;
  }

  newScene() {
    this._sceneOpToken += 1;

    for (const id of this.sceneManager.entities.keys()) {
      this.resourceTracker?.releaseBucket?.(`entity:${id}`);
    }
    this.sceneManager.clearEntities();
    this._activeSceneLogicalPath = null;
    this._currentEnvironment = null;

    const defaultName = String(this.saveConfig.defaultName ?? 'untitled').trim() || 'untitled';
    this.sceneManager.setSceneNameFromFile?.(defaultName);

    this.eventBus?.emit?.('scene:new', { name: defaultName });
    return defaultName;
  }

  async loadSceneFromDisk() {
    if (!('showOpenFilePicker' in window)) {
      throw new Error('File System Access API is not supported in this browser.');
    }

    const ext = String(this.saveConfig.extension ?? '.scene.json').toLowerCase();
    const [fileHandle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: `LingPusSST Scene (${ext})`,
          accept: { 'application/json': [ext] },
        },
      ],
    });

    const file = await fileHandle.getFile();
    if (!file.name.toLowerCase().endsWith(ext)) {
      return null;
    }

    const rawText = await file.text();
    const parsed = JSON.parse(rawText);
    const sceneName = file.name.slice(0, -ext.length);

    await this.loadScene({ ...parsed, name: parsed.name || sceneName });
    this._activeSceneLogicalPath = file.name;
    this.sceneManager.setSceneNameFromFile?.(file.name);

    return { fileName: file.name, name: sceneName };
  }

  async spawnEntityFromAsset(logicalPath, options = {}) {
    const expectedToken = options._opToken ?? this._sceneOpToken;
    const meta = this.assetResolver.getAssetMeta(logicalPath);
    const lower = logicalPath.toLowerCase();
    const id = options.id ?? `entity_${crypto.randomUUID().slice(0, 8)}`;

    if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
      const gltf = await this.assetResolver.loadAsset(logicalPath);
      if (this._sceneOpToken !== expectedToken) return null;

      const resolvedName = options.name ?? meta?.name ?? id;
      const batchedProxy = this.batchPool?.spawnBatchedProxy(id, logicalPath, gltf.scene, {
        name: resolvedName,
      });

      const root = batchedProxy ?? gltf.scene.clone(true);
      root.name = resolvedName;
      applyTransform(root, options.transform);
      if (!batchedProxy) {
        this.resourceTracker?.track?.(root, `entity:${id}`);
      }

      const entity = this.sceneManager.addEntity(id, root, {
        name: root.name,
        logicalPath,
        category: 'models',
        ...(options.metadata ?? {}),
      });
      this.batchPool?.syncTransforms();
      return entity;
    }

    if (lower.endsWith('.prefab.json')) {
      const prefabData = await this.assetResolver.loadAsset(logicalPath);
      if (this._sceneOpToken !== expectedToken) return null;

      const group = new THREE.Group();
      group.name = options.name ?? prefabData.name ?? meta?.name ?? id;
      applyTransform(group, options.transform);

      for (const child of prefabData.children ?? []) {
        if (!child.logicalPath) continue;
        const childGltf = await this.assetResolver.loadAsset(child.logicalPath);
        if (this._sceneOpToken !== expectedToken) {
          this.resourceTracker?.releaseBucket?.(`entity:${id}`);
          return null;
        }
        const childMesh = childGltf.scene.clone(true);
        childMesh.name = child.name ?? 'PrefabPart';
        applyTransform(childMesh, child.transform);
        group.add(childMesh);
      }

      if (this._sceneOpToken !== expectedToken) return null;
      this.resourceTracker?.track?.(group, `entity:${id}`);

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
    const isPath = typeof sceneDataOrPath === 'string';
    const ext = String(this.saveConfig.extension ?? '.scene.json').toLowerCase();

    if (isPath && !sceneDataOrPath.toLowerCase().endsWith(ext)) {
      return null;
    }

    const opToken = ++this._sceneOpToken;

    const data = isPath
      ? await this.assetResolver.loadAsset(sceneDataOrPath)
      : sceneDataOrPath;

    if (this._sceneOpToken !== opToken) return null;

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid scene payload.');
    }

    for (const id of this.sceneManager.entities.keys()) {
      this.resourceTracker?.releaseBucket?.(`entity:${id}`);
    }
    this.sceneManager.clearEntities();

    if (isPath) {
      this._activeSceneLogicalPath = this.assetResolver.normalizeLogicalPath(sceneDataOrPath);
    }

    if (data.environment) {
      this._currentEnvironment = data.environment;
      this.eventBus?.emit?.('environment:loadRequest', { logicalPath: data.environment });
    }

    let spawnedCount = 0;
    for (const item of data.entities ?? []) {
      if (this._sceneOpToken !== opToken) return null;
      if (!item.logicalPath) continue;

      const spawned = await this.spawnEntityFromAsset(item.logicalPath, {
        id: item.id,
        name: item.name,
        transform: item.transform,
        metadata: item.metadata,
        _opToken: opToken,
      });

      if (this._sceneOpToken !== opToken) return null;
      if (spawned) spawnedCount += 1;
    }

    if (this._sceneOpToken !== opToken) return null;

    this.eventBus?.emit?.('scene:loaded', {
      name: data.name ?? 'Loaded Scene',
      logicalPath: this._activeSceneLogicalPath,
      count: spawnedCount,
    });
  }

  dispose() {
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
  }
}
