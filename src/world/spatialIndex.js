import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class SpatialIndex {
  constructor({ sceneManager, eventBus, batchPool = null }) {
    if (!sceneManager) throw new Error('SpatialIndex requires sceneManager.');

    this.sceneManager = sceneManager;
    this.eventBus = eventBus ?? null;
    this.batchPool = batchPool;
    this._meshes = [];
    this._raycaster = new THREE.Raycaster();
    this._raycaster.firstHitOnly = true;

    this._tmpBox = new THREE.Box3();
    this._tmpSphere = new THREE.Sphere();
    this._tmpLocalSphere = new THREE.Sphere();
    this._tmpInvMat = new THREE.Matrix4();
    this._tmpLocalRay = new THREE.Ray();
    this._tmpClosest = new THREE.Vector3();
    this._tmpWorldClosest = new THREE.Vector3();
    this._tmpNormal = new THREE.Vector3();

    this._unsubs = [
      this.eventBus?.on?.('scene:changed', () => this.rebuild()),
    ].filter(Boolean);

    this.rebuild();
  }

  rebuild() {
    this._meshes = [];
    this.sceneManager.worldGroup.updateMatrixWorld(true);

    this.sceneManager.worldGroup.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      if (!obj.geometry.boundsTree) {
        obj.geometry.boundsTree = new MeshBVH(obj.geometry);
      }
      this._meshes.push(obj);
    });
  }

  _raycastBatched(origin, direction, maxDistance) {
    if (!this.batchPool?.forEachActiveCollider) return null;

    let closestHit = null;
    let bestDist = maxDistance;

    this.batchPool.forEachActiveCollider(({ bvh, matrixWorld, boundingBox }) => {
      this._tmpInvMat.copy(matrixWorld).invert();
      this._tmpLocalRay.origin.copy(origin).applyMatrix4(this._tmpInvMat);
      this._tmpLocalRay.direction
        .copy(direction)
        .transformDirection(this._tmpInvMat)
        .normalize();

      if (boundingBox && !this._tmpLocalRay.intersectsBox(boundingBox)) {
        return;
      }

      const hit = bvh.raycastFirst(this._tmpLocalRay, THREE.DoubleSide);
      if (!hit) return;

      hit.point.applyMatrix4(matrixWorld);
      const dist = origin.distanceTo(hit.point);
      if (dist <= bestDist) {
        bestDist = dist;
        hit.distance = dist;
        closestHit = hit;
      }
    });

    return closestHit;
  }

  raycast(origin, direction, maxDistance = Infinity) {
    let bestHit = null;

    if (this._meshes.length > 0) {
      this._raycaster.set(origin, direction);
      this._raycaster.near = 0;
      this._raycaster.far = maxDistance;
      const hits = this._raycaster.intersectObjects(this._meshes, false);
      if (hits[0]) {
        bestHit = hits[0];
      }
    }

    const batchedHit = this._raycastBatched(
      origin,
      direction,
      bestHit ? bestHit.distance : maxDistance
    );

    return batchedHit ?? bestHit;
  }

  raycastFromCamera(ndcX, ndcY, camera) {
    this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    return this.raycast(this._raycaster.ray.origin, this._raycaster.ray.direction, Infinity);
  }

  _resolveAgainstBvh(bvh, matrixWorld, boundingBox, center, radius) {
    this._tmpInvMat.copy(matrixWorld).invert();
    this._tmpLocalSphere.copy(this._tmpSphere).applyMatrix4(this._tmpInvMat);

    if (boundingBox && !boundingBox.intersectsSphere(this._tmpLocalSphere)) {
      return false;
    }

    let hitAny = false;
    bvh.shapecast({
      intersectsBounds: (box) => box.intersectsSphere(this._tmpLocalSphere),
      intersectsTriangle: (tri) => {
        tri.closestPointToPoint(this._tmpLocalSphere.center, this._tmpClosest);
        const distSq = this._tmpClosest.distanceToSquared(this._tmpLocalSphere.center);
        if (distSq < this._tmpLocalSphere.radius * this._tmpLocalSphere.radius) {
          this._tmpWorldClosest.copy(this._tmpClosest).applyMatrix4(matrixWorld);
          this._tmpNormal.subVectors(center, this._tmpWorldClosest);
          const dist = this._tmpNormal.length();
          if (dist > 1e-6) {
            this._tmpNormal.divideScalar(dist);
            center.addScaledVector(this._tmpNormal, radius - dist);
          } else {
            center.y += radius;
          }
          this._tmpSphere.center.copy(center);
          this._tmpLocalSphere.copy(this._tmpSphere).applyMatrix4(this._tmpInvMat);
          hitAny = true;
        }
        return false;
      },
    });

    return hitAny;
  }

  resolveSphere(center, radius) {
    let collided = false;
    this._tmpSphere.set(center, radius);

    for (const mesh of this._meshes) {
      const bvh = mesh.geometry.boundsTree;
      if (!bvh) continue;
      if (this._resolveAgainstBvh(bvh, mesh.matrixWorld, mesh.geometry.boundingBox, center, radius)) {
        collided = true;
      }
    }

    if (this.batchPool?.forEachActiveCollider) {
      this.batchPool.forEachActiveCollider(({ bvh, matrixWorld, boundingBox }) => {
        if (this._resolveAgainstBvh(bvh, matrixWorld, boundingBox, center, radius)) {
          collided = true;
        }
      });
    }

    return collided;
  }

  resolveWalk(eyePosition, radius, eyeHeight) {
    let grounded = false;
    const footY = eyePosition.y - eyeHeight;

    // 1. Horizontal capsule/sphere wall push-out at waist height
    const waistCenter = new THREE.Vector3(eyePosition.x, footY + radius + 0.05, eyePosition.z);
    this.resolveSphere(waistCenter, radius);
    eyePosition.x = waistCenter.x;
    eyePosition.z = waistCenter.z;

    // 2. Downward ground snap ray from waist to slightly below feet
    const rayOrigin = new THREE.Vector3(eyePosition.x, footY + eyeHeight * 0.5, eyePosition.z);
    const hit = this.raycast(rayOrigin, new THREE.Vector3(0, -1, 0), eyeHeight * 0.5 + 0.05);
    if (hit && hit.point.y >= footY - 0.05) {
      eyePosition.y = hit.point.y + eyeHeight;
      grounded = true;
    }

    return grounded;
  }

  dispose() {
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
    this._meshes = [];
  }
}
