import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;
const _invInstanceMat = new THREE.Matrix4();
const _instanceMat = new THREE.Matrix4();
const _worldInstanceMat = new THREE.Matrix4();
const _localRay = new THREE.Ray();

THREE.BatchedMesh.prototype.raycast = function batchedBvhRaycast(raycaster, intersects) {
  if (!this.visible) return;

  const instanceCount = this.instanceCount ?? this._instanceInfo?.length ?? 0;
  for (let instanceId = 0; instanceId < instanceCount; instanceId += 1) {
    if (!this.getVisibleAt(instanceId)) continue;

    const geoId = this.getGeometryIdAt(instanceId);
    const geo = this.getGeometryRangeAt ? null : this._geometryInfo?.[geoId]?.geometry;
    // Fallback to native raycast if Three.js internal layout differs
    if (!geo || !geo.boundsTree) {
      defaultBatchedRaycast.call(this, raycaster, intersects);
      return;
    }

    this.getMatrixAt(instanceId, _instanceMat);
    _worldInstanceMat.multiplyMatrices(this.matrixWorld, _instanceMat);
    _invInstanceMat.copy(_worldInstanceMat).invert();

    _localRay.copy(raycaster.ray).applyMatrix4(_invInstanceMat);

    const hit = geo.boundsTree.raycastFirst(_localRay, THREE.DoubleSide);
    if (hit) {
      hit.point.applyMatrix4(_worldInstanceMat);
      hit.distance = raycaster.ray.origin.distanceTo(hit.point);
      if (hit.distance >= raycaster.near && hit.distance <= raycaster.far) {
        hit.object = this;
        hit.batchId = instanceId;
        intersects.push(hit);
      }
    }
  }
};

function normalizeGeometryForBatching(sourceGeo) {
  const geo = sourceGeo.index ? sourceGeo.toNonIndexed() : sourceGeo.clone();
  if (!geo.attributes.normal) {
    geo.computeVertexNormals();
  }
  return geo;
}

function getMaterialSignature(material) {
  const mat = Array.isArray(material) ? material[0] : material;
  if (!mat) return 'default';
  return [
    mat.type,
    mat.uuid,
    mat.transparent ? '1' : '0',
    mat.alphaTest ?? 0,
    mat.side ?? THREE.FrontSide,
  ].join(':');
}

function extractMergedMaterialBuckets(rootScene) {
  rootScene.updateMatrixWorld(true);
  const invRoot = rootScene.matrixWorld.clone().invert();
  const buckets = new Map();

  let hasUnsupported = false;

  rootScene.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    if (node.isSkinnedMesh || node.isInstancedMesh || node.morphTargetInfluences) {
      hasUnsupported = true;
      return;
    }

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const groups =
      node.geometry.groups?.length > 0
        ? node.geometry.groups
        : [{ start: 0, count: Infinity, materialIndex: 0 }];

    const relMatrix = new THREE.Matrix4().multiplyMatrices(invRoot, node.matrixWorld);

    for (const grp of groups) {
      const mat = materials[grp.materialIndex ?? 0] ?? materials[0];
      if (!mat) continue;

      let partGeo = normalizeGeometryForBatching(node.geometry);
      if (grp.count !== Infinity) {
        const pos = partGeo.attributes.position;
        const end = Math.min(pos.count, grp.start + grp.count);
        for (const attrName of Object.keys(partGeo.attributes)) {
          const attr = partGeo.attributes[attrName];
          partGeo.setAttribute(
            attrName,
            new THREE.BufferAttribute(
              attr.array.slice(grp.start * attr.itemSize, end * attr.itemSize),
              attr.itemSize,
              attr.normalized
            )
          );
        }
      }

      partGeo.applyMatrix4(relMatrix);

      const sig = getMaterialSignature(mat);
      if (!buckets.has(sig)) {
        buckets.set(sig, {
          material: mat,
          castShadow: Boolean(node.castShadow),
          receiveShadow: Boolean(node.receiveShadow),
          geometries: [],
        });
      }
      const bucket = buckets.get(sig);
      bucket.castShadow = bucket.castShadow || Boolean(node.castShadow);
      bucket.receiveShadow = bucket.receiveShadow || Boolean(node.receiveShadow);
      bucket.geometries.push(partGeo);
    }
  });

  if (hasUnsupported || buckets.size === 0) {
    for (const bucket of buckets.values()) {
      for (const g of bucket.geometries) g.dispose();
    }
    return null;
  }

  const compiledParts = [];
  for (const bucket of buckets.values()) {
    // Harmonize attribute keys across merged geometries
    const commonAttrs = new Set(Object.keys(bucket.geometries[0].attributes));
    for (let i = 1; i < bucket.geometries.length; i += 1) {
      for (const key of commonAttrs) {
        if (!bucket.geometries[i].attributes[key]) {
          commonAttrs.delete(key);
        }
      }
    }
    for (const g of bucket.geometries) {
      for (const key of Object.keys(g.attributes)) {
        if (!commonAttrs.has(key)) {
          g.deleteAttribute(key);
        }
      }
    }

    const merged =
      bucket.geometries.length === 1
        ? bucket.geometries[0]
        : mergeGeometries(bucket.geometries, false);

    if (bucket.geometries.length > 1) {
      for (const g of bucket.geometries) g.dispose();
    }

    if (!merged) return null;

    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    merged.computeBoundsTree();

    compiledParts.push({
      geometry: merged,
      material: bucket.material,
      castShadow: bucket.castShadow,
      receiveShadow: bucket.receiveShadow,
      vertexCount: merged.attributes.position.count,
      indexCount: merged.index ? merged.index.count : merged.attributes.position.count,
    });
  }

  return compiledParts;
}

export class BatchPoolManager {
  constructor({ scene, eventBus, initialCapacity = 32 }) {
    if (!scene) throw new Error('BatchPoolManager requires a THREE.Scene.');

    this.scene = scene;
    this.eventBus = eventBus ?? null;
    this.initialCapacity = Math.max(4, initialCapacity);

    this.batchRoot = new THREE.Group();
    this.batchRoot.name = 'BatchedWorldRoot';
    this.batchRoot.userData.excludeFromHierarchy = true;
    this.scene.add(this.batchRoot);

    this._templates = new Map();
    this._proxies = new Map();
    this._dirtyTransforms = false;

    this._unsubs = [
      this.eventBus?.on?.('render:beforeFrame', () => this.syncTransforms()),
      this.eventBus?.on?.('scene:changed', () => {
        this._dirtyTransforms = true;
      }),
    ].filter(Boolean);
  }

  _getOrCreateTemplate(logicalPath, gltfScene) {
    if (this._templates.has(logicalPath)) {
      return this._templates.get(logicalPath);
    }

    const compiledParts = extractMergedMaterialBuckets(gltfScene);
    if (!compiledParts) return null;

    const batches = compiledParts.map((part) => {
      const cap = this.initialCapacity;
      const batchedMesh = new THREE.BatchedMesh(
        cap,
        part.vertexCount,
        part.indexCount,
        part.material
      );
      batchedMesh.castShadow = part.castShadow;
      batchedMesh.receiveShadow = part.receiveShadow;
      batchedMesh.perObjectFrustumCulled = true;
      batchedMesh.sortObjects = false;
      batchedMesh.frustumCulled = false;

      const geometryId = batchedMesh.addGeometry(part.geometry);
      this.batchRoot.add(batchedMesh);

      const batchEntry = {
        batchedMesh,
        geometryId,
        capacity: cap,
        vertexCount: part.vertexCount,
        indexCount: part.indexCount,
        activeInstances: new Map(), // entityId -> instanceId
      };
      this._attachBatchRaycast(batchedMesh, part.geometry, batchEntry);
      return batchEntry;
    });

    const template = { logicalPath, compiledParts, batches };
    this._templates.set(logicalPath, template);
    return template;
  }

  _growBatch(batchEntry) {
    const nextCap = batchEntry.capacity * 2;
    const oldMesh = batchEntry.batchedMesh;

    const newMesh = new THREE.BatchedMesh(
      nextCap,
      batchEntry.vertexCount,
      batchEntry.indexCount,
      oldMesh.material
    );
    newMesh.castShadow = oldMesh.castShadow;
    newMesh.receiveShadow = oldMesh.receiveShadow;
    newMesh.perObjectFrustumCulled = true;
    newMesh.sortObjects = false;
    newMesh.frustumCulled = false;

    const partGeo = this._findGeometryForBatch(batchEntry);
    const newGeoId = newMesh.addGeometry(partGeo);

    const nextMap = new Map();
    const mat4 = new THREE.Matrix4();

    for (const [entityId, oldInstanceId] of batchEntry.activeInstances.entries()) {
      const newInstanceId = newMesh.addInstance(newGeoId);
      oldMesh.getMatrixAt(oldInstanceId, mat4);
      newMesh.setMatrixAt(newInstanceId, mat4);
      newMesh.setVisibleAt(newInstanceId, oldMesh.getVisibleAt(oldInstanceId));
      nextMap.set(entityId, newInstanceId);
    }

    this.batchRoot.remove(oldMesh);
    oldMesh.dispose();
    this.batchRoot.add(newMesh);

    batchEntry.batchedMesh = newMesh;
    batchEntry.geometryId = newGeoId;
    batchEntry.capacity = nextCap;
    batchEntry.activeInstances = nextMap;
    this._attachBatchRaycast(newMesh, partGeo, batchEntry);
  }

  _findGeometryForBatch(targetBatch) {
    for (const tpl of this._templates.values()) {
      const idx = tpl.batches.indexOf(targetBatch);
      if (idx >= 0) return tpl.compiledParts[idx].geometry;
    }
    return null;
  }

  spawnBatchedProxy(entityId, logicalPath, gltfScene, { name } = {}) {
    const template = this._getOrCreateTemplate(logicalPath, gltfScene);
    if (!template) return null;

    if (this._proxies.has(entityId)) {
      this.removeProxy(entityId);
    }

    const proxy = new THREE.Object3D();
    proxy.name = name || entityId;
    proxy.userData.isBatchedProxy = true;
    proxy.userData.batchedLogicalPath = logicalPath;

    const slots = [];
    for (const batchEntry of template.batches) {
      if (batchEntry.activeInstances.size >= batchEntry.capacity) {
        this._growBatch(batchEntry);
      }
      const instanceId = batchEntry.batchedMesh.addInstance(batchEntry.geometryId);
      batchEntry.activeInstances.set(entityId, instanceId);
      slots.push({ batchEntry, instanceId });
    }

    this._proxies.set(entityId, { proxy, template, slots });
    this._dirtyTransforms = true;
    return proxy;
  }

  removeProxy(entityId) {
    const record = this._proxies.get(entityId);
    if (!record) return false;

    for (const { batchEntry } of record.slots) {
      const currentInstanceId = batchEntry.activeInstances.get(entityId);
      if (currentInstanceId !== undefined) {
        batchEntry.batchedMesh.deleteInstance(currentInstanceId);
        batchEntry.activeInstances.delete(entityId);
      }
    }

    this._proxies.delete(entityId);
    return true;
  }

  syncTransforms() {
    if (this._proxies.size === 0) return;

    for (const [entityId, { proxy, slots }] of this._proxies.entries()) {
      proxy.updateWorldMatrix(true, false);
      const visible = Boolean(proxy.visible && proxy.parent);

      for (const { batchEntry } of slots) {
        const instanceId = batchEntry.activeInstances.get(entityId);
        if (instanceId === undefined) continue;
        batchEntry.batchedMesh.setMatrixAt(instanceId, proxy.matrixWorld);
        batchEntry.batchedMesh.setVisibleAt(instanceId, visible);
      }
    }

    for (const tpl of this._templates.values()) {
      for (const batchEntry of tpl.batches) {
        if (batchEntry.activeInstances.size > 0) {
          batchEntry.batchedMesh.computeBoundingSphere();
        }
      }
    }

    this._dirtyTransforms = false;
  }

  resolveEntityFromHit(batchedMesh, batchId) {
    if (!batchedMesh || batchId === undefined || batchId === null) return null;

    for (const tpl of this._templates.values()) {
      for (const batchEntry of tpl.batches) {
        if (batchEntry.batchedMesh !== batchedMesh) continue;
        for (const [entityId, instanceId] of batchEntry.activeInstances.entries()) {
          if (instanceId === batchId) {
            return this._proxies.get(entityId)?.proxy ?? null;
          }
        }
      }
    }
    return null;
  }

  getProxyLocalBounds(entityId) {
    const record = this._proxies.get(entityId);
    if (!record) return null;

    const box = new THREE.Box3();
    for (const part of record.template.compiledParts) {
      if (!part.geometry.boundingBox) {
        part.geometry.computeBoundingBox();
      }
      if (part.geometry.boundingBox) {
        box.union(part.geometry.boundingBox);
      }
    }
    return box.isEmpty() ? null : box;
  }

  getProxyRenderParts(entityId) {
    const record = this._proxies.get(entityId);
    if (!record) return null;
    return {
      proxy: record.proxy,
      parts: record.template.compiledParts,
    };
  }

  getTemplateSnapshot(logicalPath) {
    const tpl = this._templates.get(logicalPath);
    if (!tpl) return null;

    const bounds = new THREE.Box3();
    for (const part of tpl.compiledParts) {
      if (!part.geometry.boundingBox) {
        part.geometry.computeBoundingBox();
      }
      if (part.geometry.boundingBox) {
        bounds.union(part.geometry.boundingBox);
      }
    }

    return {
      parts: tpl.compiledParts,
      bounds: bounds.isEmpty() ? null : bounds,
    };
  }

  _attachBatchRaycast(batchedMesh, partGeometry, batchEntry) {
    const invWorldMat = new THREE.Matrix4();
    const instanceMat = new THREE.Matrix4();
    const fullWorldMat = new THREE.Matrix4();
    const localRay = new THREE.Ray();

    batchedMesh.raycast = (raycaster, intersects) => {
      if (!batchedMesh.visible || !partGeometry.boundsTree) return;

      for (const instanceId of batchEntry.activeInstances.values()) {
        if (!batchedMesh.getVisibleAt(instanceId)) continue;

        batchedMesh.getMatrixAt(instanceId, instanceMat);
        fullWorldMat.multiplyMatrices(batchedMesh.matrixWorld, instanceMat);
        invWorldMat.copy(fullWorldMat).invert();

        localRay.copy(raycaster.ray).applyMatrix4(invWorldMat);

        const hit = partGeometry.boundsTree.raycastFirst(localRay, THREE.DoubleSide);
        if (!hit) continue;

        hit.point.applyMatrix4(fullWorldMat);
        hit.distance = raycaster.ray.origin.distanceTo(hit.point);
        if (hit.distance < raycaster.near || hit.distance > raycaster.far) continue;

        if (hit.face?.normal) {
          hit.face.normal.transformDirection(fullWorldMat);
        }
        hit.object = batchedMesh;
        hit.batchId = instanceId;
        intersects.push(hit);
      }
    };
  }

  dispose() {
    for (const u of this._unsubs) u?.();
    this._unsubs = [];

    for (const tpl of this._templates.values()) {
      for (const batchEntry of tpl.batches) {
        this.batchRoot.remove(batchEntry.batchedMesh);
        batchEntry.batchedMesh.dispose();
      }
      for (const part of tpl.compiledParts) {
        part.geometry.dispose();
      }
    }

    this._templates.clear();
    this._proxies.clear();
    this.scene.remove(this.batchRoot);
  }
}
