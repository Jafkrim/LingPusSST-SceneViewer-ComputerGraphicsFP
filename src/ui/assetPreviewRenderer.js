import * as THREE from 'three';

const PREVIEW_EXTENSIONS = new Set([
  '.glb',
  '.gltf',
  '.prefab.json',
  '.hdr',
  '.exr',
  '.tga',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);

function getMatchingExt(logicalPath = '') {
  const lower = String(logicalPath).toLowerCase();
  for (const ext of PREVIEW_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext;
  }
  return null;
}

export class AssetPreviewRenderer {
  constructor({ assetResolver, resolution = 160, uiScale = 1, maxCacheEntries = 240 } = {}) {
    this.assetResolver = assetResolver;
    this.baseResolution = Math.max(64, Number(resolution) || 160);
    this.uiScale = Math.max(0.5, Number(uiScale) || 1);
    this.maxCacheEntries = Math.max(32, Number(maxCacheEntries) || 240);

    const dims = this._computeTargetDimensions();
    this.width = dims.width;
    this.height = dims.height;

    this._cache = new Map();
    this._inFlight = new Map();
    this._queue = [];
    this._processing = false;

    this._renderer = null;
    this._scene = null;
    this._camera = null;
    this._quadScene = null;
    this._quadCamera = null;
    this._quadMesh = null;
    this._2dCanvas = null;
    this._2dCtx = null;
  }

  _computeTargetDimensions() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scaled = Math.round(this.baseResolution * this.uiScale * dpr);
    const width = Math.min(384, Math.max(72, Math.round(scaled / 8) * 8));
    return {
      width,
      height: Math.max(54, Math.round(width * 0.75)),
    };
  }

  setUiScale(scale) {
    const nextScale = Math.max(0.5, Number(scale) || 1);
    const prevWidth = this.width;
    this.uiScale = nextScale;
    const { width, height } = this._computeTargetDimensions();
    if (width === prevWidth) return false;

    this.width = width;
    this.height = height;
    if (this._renderer) {
      this._renderer.setSize(this.width, this.height, false);
    }
    if (this._camera) {
      this._camera.aspect = this.width / this.height;
      this._camera.updateProjectionMatrix();
    }
    if (this._2dCanvas) {
      this._2dCanvas.width = this.width;
      this._2dCanvas.height = this.height;
    }

    // Jika resolusi target naik signifikan (mis. 80% -> 160%), bersihkan cache beresolusi rendah
    if (width > prevWidth * 1.15) {
      this.clearCache();
      return true;
    }
    return false;
  }

  _setCacheEntry(key, value) {
    if (this._cache.size >= this.maxCacheEntries) {
      const oldestKey = this._cache.keys().next().value;
      if (oldestKey !== undefined) this._cache.delete(oldestKey);
    }
    this._cache.set(key, value);
  }

  canPreview(logicalPath) {
    return Boolean(getMatchingExt(logicalPath));
  }

  getCached(logicalPath) {
    return this._cache.get(logicalPath) ?? null;
  }

  clearCache() {
    this._cache.clear();
  }

  _ensureRenderer() {
    if (this._renderer) return;

    this._renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    this._renderer.setPixelRatio(1);
    this._renderer.setSize(this.width, this.height, false);
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.0;

    // 3D Stage for GLB / GLTF / Prefabs
    this._scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0xffffff, 0x262a33, 1.35);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(4, 7, 5);
    const rim = new THREE.DirectionalLight(0x8ab4f8, 0.65);
    rim.position.set(-5, 3, -4);
    this._scene.add(hemi, key, rim);

    this._camera = new THREE.PerspectiveCamera(38, this.width / this.height, 0.01, 500);

    // Fullscreen Quad Stage for HDR / EXR / TGA
    this._quadScene = new THREE.Scene();
    this._quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._quadMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this._quadScene.add(this._quadMesh);
  }

  requestPreview(logicalPath) {
    if (!this.canPreview(logicalPath)) return Promise.resolve(null);
    if (this._cache.has(logicalPath)) {
      return Promise.resolve(this._cache.get(logicalPath));
    }
    if (this._inFlight.has(logicalPath)) {
      return this._inFlight.get(logicalPath);
    }

    const promise = new Promise((resolve) => {
      this._queue.push({ logicalPath, resolve });
      this._drainQueue();
    });

    this._inFlight.set(logicalPath, promise);
    return promise;
  }

  async _drainQueue() {
    if (this._processing) return;
    this._processing = true;

    let batchCount = 0;
    while (this._queue.length > 0) {
      const job = this._queue.shift();
      try {
        const dataUrl = await this._renderPreview(job.logicalPath);
        if (dataUrl) {
          this._setCacheEntry(job.logicalPath, dataUrl);
        }
        job.resolve(dataUrl);
      } catch {
        job.resolve(null);
      } finally {
        this._inFlight.delete(job.logicalPath);
      }
      batchCount += 1;
      if (batchCount >= 3 && this._queue.length > 0) {
        batchCount = 0;
        await new Promise((r) => requestAnimationFrame(r));
      }
    }

    this._processing = false;
  }

  async _buildPrefabRoot(prefabData) {
    const root = new THREE.Group();
    const entities = Array.isArray(prefabData?.entities)
      ? prefabData.entities
      : prefabData?.root
        ? [prefabData.root]
        : [];

    for (const ent of entities) {
      const assetPath = ent.assetPath ?? ent.model ?? ent.logicalPath;
      if (!assetPath) continue;
      try {
        const loaded = await this.assetResolver.loadAsset(assetPath);
        const obj = (loaded?.scene ?? loaded)?.clone?.(true);
        if (!obj) continue;
        if (Array.isArray(ent.position)) obj.position.fromArray(ent.position);
        if (Array.isArray(ent.rotation)) obj.rotation.fromArray(ent.rotation);
        if (Array.isArray(ent.scale)) obj.scale.fromArray(ent.scale);
        root.add(obj);
      } catch {}
    }
    return root;
  }

  async _renderPreview(logicalPath) {
    if (!this.assetResolver) return null;
    const ext = getMatchingExt(logicalPath);
    if (!ext) return null;

    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') {
      return this._renderWebImage(this.assetResolver.resolveUrl(logicalPath));
    }

    this._ensureRenderer();

    if (ext === '.hdr' || ext === '.exr' || ext === '.tga') {
      const tex = await this.assetResolver.loadAsset(logicalPath);
      if (!tex) return null;
      this._quadMesh.material.map = tex;
      this._quadMesh.material.needsUpdate = true;
      this._renderer.clear();
      this._renderer.render(this._quadScene, this._quadCamera);
      const url = this._renderer.domElement.toDataURL('image/webp', 0.78);
      this._quadMesh.material.map = null;
      return url;
    }

    let subject = null;
    let prevParent = null;
    if (ext === '.glb' || ext === '.gltf') {
      const gltf = await this.assetResolver.loadAsset(logicalPath);
      subject = gltf?.scene ?? null;
      prevParent = subject?.parent ?? null;
    } else if (ext === '.prefab.json') {
      const prefabJson = await this.assetResolver.loadAsset(logicalPath);
      subject = await this._buildPrefabRoot(prefabJson);
    }

    if (!subject) return null;

    this._scene.add(subject);
    try {
      subject.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(subject);
      if (box.isEmpty()) return null;

      const center = box.getCenter(new THREE.Vector3());
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = Math.max(0.05, sphere.radius);
      const fovRad = THREE.MathUtils.degToRad(this._camera.fov);
      const dist = (radius / Math.sin(fovRad * 0.5)) * 1.25;

      const dir = new THREE.Vector3(0.75, 0.55, 0.85).normalize();
      this._camera.position.copy(center).addScaledVector(dir, dist);
      this._camera.near = Math.max(0.001, dist * 0.01);
      this._camera.far = Math.max(100, dist * 10);
      this._camera.updateProjectionMatrix();
      this._camera.lookAt(center);

      this._renderer.clear();
      this._renderer.render(this._scene, this._camera);
      return this._renderer.domElement.toDataURL('image/webp', 0.78);
    } finally {
      this._scene.remove(subject);
      if (prevParent) prevParent.add(subject);
    }
  }

  _ensure2DCanvas() {
    if (!this._2dCanvas) {
      this._2dCanvas = document.createElement('canvas');
      this._2dCtx = this._2dCanvas.getContext('2d');
    }
    if (this._2dCanvas.width !== this.width || this._2dCanvas.height !== this.height) {
      this._2dCanvas.width = this.width;
      this._2dCanvas.height = this.height;
    }
    return this._2dCtx;
  }

  _renderWebImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => {
        const ctx = this._ensure2DCanvas();
        if (!ctx) {
          resolve(url);
          return;
        }
        ctx.clearRect(0, 0, this.width, this.height);
        const scale = Math.min(this.width / img.width, this.height / img.height);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const x = Math.round((this.width - w) * 0.5);
        const y = Math.round((this.height - h) * 0.5);
        ctx.drawImage(img, x, y, w, h);
        resolve(this._2dCanvas.toDataURL('image/webp', 0.78));
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  dispose() {
    this._queue.length = 0;
    this._inFlight.clear();
    this._cache.clear();
    this._quadMesh?.geometry?.dispose?.();
    this._quadMesh?.material?.dispose?.();
    this._renderer?.dispose?.();
    this._renderer = null;
    this._2dCanvas = null;
    this._2dCtx = null;
  }
}
