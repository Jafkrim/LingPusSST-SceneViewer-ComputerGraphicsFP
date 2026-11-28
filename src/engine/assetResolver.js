import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';

const HANDLE_DB_NAME = 'lingpus_sst_fs_handles';
const HANDLE_STORE_NAME = 'handles';
const PUBLIC_DIR_KEY = 'public_save_dir';

function openHandleDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(HANDLE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(HANDLE_STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStoredPublicHandle() {
  try {
    const db = await openHandleDb();
    if (!db) return null;
    return await new Promise((resolve) => {
      const tx = db.transaction(HANDLE_STORE_NAME, 'readonly');
      const req = tx.objectStore(HANDLE_STORE_NAME).get(PUBLIC_DIR_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function storePublicHandle(handle) {
  try {
    const db = await openHandleDb();
    if (!db || !handle) return;
    await new Promise((resolve) => {
      const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
      tx.objectStore(HANDLE_STORE_NAME).put(handle, PUBLIC_DIR_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

export class AssetResolver {
  constructor({ eventBus, resourceTracker = null, config = {} } = {}) {
    this.eventBus = eventBus ?? null;
    this.resourceTracker = resourceTracker;
    this.config = config;

    this.manifest = {
      tree: {
        name: 'public',
        logicalPath: '',
        folderRule: null,
        directories: [],
        files: [],
      },
    };
    this._assetIndex = new Map();
    this._dirIndex = new Map();
    this._eventSource = null;

    this._assetCache = new Map();
    this._inFlightAssets = new Map();

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');

    this._gltfLoader = new GLTFLoader();
    this._gltfLoader.setDRACOLoader(dracoLoader);
    this._gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    this._hdrLoader = new HDRLoader();
    this._exrLoader = new EXRLoader();
    this._tgaLoader = new TGALoader();
    this._textureLoader = new THREE.TextureLoader();

    this._connectLiveWatcher();
  }

  configure(cbConfig = {}) {
    this.config = { ...this.config, ...cbConfig };
  }

  _connectLiveWatcher() {
    if (!import.meta.env.DEV || typeof window === 'undefined' || !window.EventSource) return;
    this._eventSource = new window.EventSource('/__content-events');
    this._eventSource.onmessage = (e) => {
      try {
        this._applyManifest(JSON.parse(e.data));
      } catch {}
    };
  }

  _indexTree(node) {
    if (!node || typeof node !== 'object') return;
    this._dirIndex.set(node.logicalPath ?? '', node);

    for (const file of node.files ?? []) {
      this._assetIndex.set(file.logicalPath, file);
    }

    for (const dir of node.directories ?? []) {
      this._indexTree(dir);
    }
  }

  _applyManifest(data) {
    this.manifest = data?.tree
      ? data
      : {
          tree: {
            name: 'public',
            logicalPath: '',
            folderRule: null,
            directories: [],
            files: [],
          },
        };

    this._assetIndex.clear();
    this._assetCache.clear();
    this._dirIndex.clear();
    this._indexTree(this.manifest.tree);

    this.eventBus?.emit?.('content:manifestUpdated', this.manifest);
  }

  normalizeLogicalPath(logicalPath) {
    const clean = String(logicalPath ?? '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');

    if (!clean || clean.includes('..')) {
      throw new Error(`Invalid public asset path: "${logicalPath}"`);
    }

    return clean;
  }

  resolveUrl(logicalPath) {
    return `/${this.normalizeLogicalPath(logicalPath)}`;
  }

  async refreshManifest() {
    const endpoint = import.meta.env.DEV ? '/__content-manifest' : '/content-manifest.json';
    const res = await fetch(endpoint, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Failed to load content manifest (${res.status})`);
    }
    const data = await res.json();
    this._applyManifest(data);
    return this.manifest;
  }

  getManifest() {
    return this.manifest;
  }

  getDirectoryNode(logicalPath = '') {
    const clean = String(logicalPath ?? '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
    return this._dirIndex.get(clean) ?? null;
  }

  getAssetMeta(logicalPath) {
    return this._assetIndex.get(this.normalizeLogicalPath(logicalPath)) ?? null;
  }

  isAssetAllowedInFolder(logicalPath, folderRule) {
    const rules = this.config.folderRules ?? {};
    if (!folderRule || !rules[folderRule]) return true;
    const lower = logicalPath.toLowerCase();
    return rules[folderRule].some((ext) => lower.endsWith(ext.toLowerCase()));
  }

  async loadAsset(logicalPath) {
    const clean = this.normalizeLogicalPath(logicalPath);
    const meta = this.getAssetMeta(clean);
    if (meta?.folder && !this.isAssetAllowedInFolder(clean, meta.folder)) {
      throw new Error(`File "${clean}" is not allowed inside "${meta.folder}/"`);
    }

    if (this._assetCache.has(clean)) {
      return this._assetCache.get(clean);
    }

    if (this._inFlightAssets.has(clean)) {
      return this._inFlightAssets.get(clean);
    }

    const url = `/${clean}`;
    const lower = clean.toLowerCase();

    const loadPromise = (async () => {
      let result;
      if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
        const gltf = await this._gltfLoader.loadAsync(url);
        this.resourceTracker?.track?.(gltf.scene, `asset:${clean}`);
        result = gltf;
      } else if (lower.endsWith('.hdr')) {
        const tex = await this._hdrLoader.loadAsync(url);
        this.resourceTracker?.track?.(tex, `asset:${clean}`);
        result = tex;
      } else if (lower.endsWith('.exr')) {
        const tex = await this._exrLoader.loadAsync(url);
        this.resourceTracker?.track?.(tex, `asset:${clean}`);
        result = tex;
      } else if (lower.endsWith('.tga')) {
        const tex = await this._tgaLoader.loadAsync(url);
        this.resourceTracker?.track?.(tex, `asset:${clean}`);
        result = tex;
      } else if (/\.(png|jpe?g|webp)$/i.test(lower)) {
        const tex = await this._textureLoader.loadAsync(url);
        this.resourceTracker?.track?.(tex, `asset:${clean}`);
        result = tex;
      } else if (lower.endsWith('.bin')) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch binary asset: ${url}`);
        result = await res.arrayBuffer();
      } else if (lower.endsWith('.prefab.json') || lower.endsWith('.scene.json')) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch JSON asset: ${url}`);
        result = await res.json();
      } else {
        throw new Error(`Unsupported asset extension for "${clean}"`);
      }

      this._assetCache.set(clean, result);
      return result;
    })();

    this._inFlightAssets.set(clean, loadPromise);
    try {
      return await loadPromise;
    } finally {
      this._inFlightAssets.delete(clean);
    }
  }

  async saveSceneToPublic(logicalPath, sceneData) {
    const clean = this.normalizeLogicalPath(logicalPath);
    const rawSuggested = clean.split('/').pop() || 'untitled.scene.json';
    const suggestedName = rawSuggested.toLowerCase().endsWith('.scene.json')
      ? rawSuggested
      : `${rawSuggested.replace(/\.json$/i, '')}.scene.json`;
    const serialized = `${JSON.stringify(sceneData, null, 2)}\n`;

    // Always open native OS "Save As" dialog when supported
    if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
      const savedDirHandle = await getStoredPublicHandle();
      const pickerOptions = {
        id: 'lingpus_sst_scene_save',
        suggestedName,
        types: [
          {
            description: 'LingPusSST Scene (*.scene.json)',
            accept: { 'application/json': ['.scene.json'] },
          },
        ],
      };

      if (savedDirHandle) {
        pickerOptions.startIn = savedDirHandle;
      }

      const fileHandle = await window.showSaveFilePicker(pickerOptions);
      const writable = await fileHandle.createWritable();
      await writable.write(serialized);
      await writable.close();

      let finalName = fileHandle.name;
      if (
        finalName.toLowerCase().endsWith('.json') &&
        !finalName.toLowerCase().endsWith('.scene.json') &&
        typeof fileHandle.move === 'function'
      ) {
        const fixedName = `${finalName.slice(0, -'.json'.length)}.scene.json`;
        try {
          await fileHandle.move(fixedName);
          finalName = fixedName;
        } catch {}
      }

      // Remember the chosen folder handle for subsequent Save As dialogs
      await storePublicHandle(fileHandle);
      return finalName;
    }

    // Fallback for browsers without showSaveFilePicker (e.g., Firefox)
    if (import.meta.env.DEV) {
      const res = await fetch('/__scene/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logicalPath: clean, data: sceneData }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to save scene to public/.');
      }
      return payload.logicalPath;
    }

    throw new Error('Save As dialog is not supported in this browser.');
  }

  dispose() {
    this._assetCache.clear();
    this._inFlightAssets.clear();
    this._eventSource?.close?.();
    this._eventSource = null;
  }
}
