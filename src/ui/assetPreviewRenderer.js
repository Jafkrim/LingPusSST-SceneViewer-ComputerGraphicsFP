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
  constructor({ assetResolver, resolution = 160 } = {}) {
    this.assetResolver = assetResolver;
    this.width = Math.max(64, Number(resolution) || 160);
    this.height = Math.round(this.width * 0.75);

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

    while (this._queue.length > 0) {
      const job = this._queue.shift();
      try {
        const dataUrl = await this._renderPreview(job.logicalPath);
        if (dataUrl) {
          this._cache.set(job.logicalPath, dataUrl);
        }
        job.resolve(dataUrl);
      } catch {
        job.resolve(null);
      } finally {
        this._inFlight.delete(job.logicalPath);
      }
      await new Promise((r) => requestAnimationFrame(r));
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
    if (ext === '.glb' || ext === '.gltf') {
      const gltf = await this.assetResolver.loadAsset(logicalPath);
      subject = gltf?.scene?.clone?.(true) ?? null;
    } else if (ext === '.prefab.json') {
      const prefabJson = await this.assetResolver.loadAsset(logicalPath);
      subject = await this._buildPrefabRoot(prefabJson);
    }

    if (!subject) return null;

    this._scene.add(subject);
    subject.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(subject);
    if (box.isEmpty()) {
      this._scene.remove(subject);
      return null;
    }

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
    const dataUrl = this._renderer.domElement.toDataURL('image/webp', 0.78);

    this._scene.remove(subject);
    return dataUrl;
  }

  _renderWebImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = this.width;
        canvas.height = this.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(url);
          return;
        }
        const scale = Math.min(this.width / img.width, this.height / img.height);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const x = Math.round((this.width - w) * 0.5);
        const y = Math.round((this.height - h) * 0.5);
        ctx.drawImage(img, x, y, w, h);
        resolve(canvas.toDataURL('image/webp', 0.78));
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
  }
}
