import * as THREE from 'three';
import {
  disposeGeometry,
  disposeMaterial,
  disposeObject3D,
  disposeTexture,
} from '@/utils/disposal.js';

export class ResourceTracker {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this._resources = new Set();
    this._buckets = new Map();
  }

  track(resource, bucket = 'default') {
    if (!resource) return resource;

    if (Array.isArray(resource)) {
      for (const item of resource) this.track(item, bucket);
      return resource;
    }

    if (resource instanceof THREE.Object3D) {
      resource.traverse((node) => {
        if (node.geometry) this._addSingle(node.geometry, bucket);
        if (node.material) {
          if (Array.isArray(node.material)) {
            for (const mat of node.material) this._trackMaterial(mat, bucket);
          } else {
            this._trackMaterial(node.material, bucket);
          }
        }
      });
      return resource;
    }

    if (resource instanceof THREE.Material) {
      return this._trackMaterial(resource, bucket);
    }

    return this._addSingle(resource, bucket);
  }

  _trackMaterial(material, bucket) {
    if (!material) return material;
    this._addSingle(material, bucket);

    for (const val of Object.values(material)) {
      if (val instanceof THREE.Texture) {
        this._addSingle(val, bucket);
      }
    }

    if (material.uniforms && typeof material.uniforms === 'object') {
      for (const uniform of Object.values(material.uniforms)) {
        const val = uniform?.value;
        if (val instanceof THREE.Texture) {
          this._addSingle(val, bucket);
        } else if (Array.isArray(val)) {
          for (const item of val) {
            if (item instanceof THREE.Texture) this._addSingle(item, bucket);
          }
        }
      }
    }

    return material;
  }

  _addSingle(resource, bucket) {
    if (!resource || typeof resource.dispose !== 'function') return resource;
    this._resources.add(resource);

    if (!this._buckets.has(bucket)) {
      this._buckets.set(bucket, new Set());
    }
    this._buckets.get(bucket).add(resource);
    return resource;
  }

  release(resource) {
    if (!resource) return;
    const disposed = new Set();

    if (resource instanceof THREE.Object3D) {
      resource.traverse((node) => {
        if (node.geometry) this._untrack(node.geometry);
        if (node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          for (const mat of mats) {
            this._untrack(mat);
            for (const val of Object.values(mat)) {
              if (val instanceof THREE.Texture) this._untrack(val);
            }
          }
        }
      });
      disposeObject3D(resource, { disposed });
      return;
    }

    this._disposeSingle(resource, disposed);
    this._untrack(resource);
  }

  releaseBucket(bucket) {
    const set = this._buckets.get(bucket);
    if (!set) return;

    const disposed = new Set();
    for (const res of set) {
      this._disposeSingle(res, disposed);
      this._resources.delete(res);
    }
    this._buckets.delete(bucket);
  }

  _untrack(resource) {
    this._resources.delete(resource);
    for (const [bucket, set] of this._buckets.entries()) {
      set.delete(resource);
      if (set.size === 0) this._buckets.delete(bucket);
    }
  }

  _disposeSingle(resource, disposed) {
    if (!resource || disposed.has(resource)) return;
    if (resource instanceof THREE.BufferGeometry) {
      disposeGeometry(resource, disposed);
    } else if (resource instanceof THREE.Material) {
      disposeMaterial(resource, disposed);
    } else if (resource instanceof THREE.Texture) {
      disposeTexture(resource, disposed);
    } else {
      disposed.add(resource);
      resource.dispose?.();
    }
  }

  getStats() {
    return {
      totalTracked: this._resources.size,
      buckets: this._buckets.size,
    };
  }

  dispose() {
    const disposed = new Set();
    for (const res of this._resources) {
      this._disposeSingle(res, disposed);
    }
    this._resources.clear();
    this._buckets.clear();
  }
}
