import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';

const ALLOWED_SCOPES = new Set(['engineContent', 'userContent']);

export class AssetResolver {
  constructor({ eventBus } = {}) {
    this.eventBus = eventBus ?? null;
    this.manifest = { packs: [] };
    this._assetIndex = new Map();
    this._eventSource = null;

    this._gltfLoader = new GLTFLoader();
    this._rgbeLoader = new RGBELoader();
    this._exrLoader = new EXRLoader();
    this._tgaLoader = new TGALoader();
    this._textureLoader = new THREE.TextureLoader();

    this._connectLiveWatcher();
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

  _applyManifest(data) {
    this.manifest = data ?? { packs: [] };
    this._assetIndex.clear();

    for (const pack of this.manifest.packs ?? []) {
      const buckets = pack.folders ?? pack.categories ?? {};
      for (const items of Object.values(buckets)) {
        for (const item of items) {
          this._assetIndex.set(item.logicalPath, item);
        }
      }
    }

    this.eventBus?.emit?.('content:manifestUpdated', this.manifest);
  }

  normalizeLogicalPath(logicalPath) {
    const clean = String(logicalPath ?? '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');

    if (!clean || clean.includes('..')) {
      throw new Error(`Invalid asset path: "${logicalPath}"`);
    }

    const [scope] = clean.split('/');
    if (!ALLOWED_SCOPES.has(scope)) {
      throw new Error(`Access denied outside public/engineContent or public/userContent: "${logicalPath}"`);
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

  getAssetMeta(logicalPath) {
    return this._assetIndex.get(this.normalizeLogicalPath(logicalPath)) ?? null;
  }

  async loadAsset(logicalPath) {
    const clean = this.normalizeLogicalPath(logicalPath);
    const url = `/${clean}`;
    const lower = clean.toLowerCase();

    if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
      return this._gltfLoader.loadAsync(url);
    }
    if (lower.endsWith('.hdr')) {
      return this._rgbeLoader.loadAsync(url);
    }
    if (lower.endsWith('.exr')) {
      return this._exrLoader.loadAsync(url);
    }
    if (lower.endsWith('.tga')) {
      return this._tgaLoader.loadAsync(url);
    }
    if (/\.(png|jpe?g|webp)$/i.test(lower)) {
      return this._textureLoader.loadAsync(url);
    }
    if (lower.endsWith('.bin')) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch binary asset: ${url}`);
      return res.arrayBuffer();
    }
    if (lower.endsWith('.prefab.json') || lower.endsWith('.scene.json')) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch JSON asset: ${url}`);
      return res.json();
    }

    throw new Error(`Unsupported asset extension for "${clean}"`);
  }

  dispose() {
    this._eventSource?.close?.();
    this._eventSource = null;
  }
}
