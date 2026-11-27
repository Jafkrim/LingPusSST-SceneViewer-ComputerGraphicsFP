import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class SpatialIndex {
  constructor({ sceneManager, eventBus }) {
    if (!sceneManager) throw new Error('SpatialIndex requires sceneManager.');

    this.sceneManager = sceneManager;
    this.eventBus = eventBus ?? null;
    this._meshes = [];
    this._raycaster = new THREE.Raycaster();
    this._raycaster.firstHitOnly = true;

    this._tmpBox = new THREE.Box3();
    this._tmpSphere = new THREE.Sphere();
    this._tmpClosest = new THREE.Vector3();
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

  raycast(origin, direction, maxDistance = Infinity) {
    if (this._meshes.length === 0) return null;
    this._raycaster.set(origin, direction);
    this._raycaster.near = 0;
    this._raycaster.far = maxDistance;
    const hits = this._raycaster.intersectObjects(this._meshes, false);
    return hits[0] ?? null;
  }

  raycastFromCamera(ndcX, ndcY, camera) {
    if (this._meshes.length === 0) return null;
    this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    this._raycaster.near = 0;
    this._raycaster.far = Infinity;
    const hits = this._raycaster.intersectObjects(this._meshes, false);
    return hits[0] ?? null;
  }

  resolveSphere(center, radius) {
    let collided = false;
    this._tmpSphere.set(center, radius);

    for (const mesh of this._meshes) {
      const bvh = mesh.geometry.boundsTree;
      if (!bvh) continue;

      const invMat = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
      const localSphere = this._tmpSphere.clone().applyMatrix4(invMat);

      bvh.shapecast({
        intersectsBounds: (box) => box.intersectsSphere(localSphere),
        intersectsTriangle: (tri) => {
          tri.closestPointToPoint(localSphere.center, this._tmpClosest);
          const distSq = this._tmpClosest.distanceToSquared(localSphere.center);
          if (distSq < localSphere.radius * localSphere.radius) {
            const worldClosest = this._tmpClosest.clone().applyMatrix4(mesh.matrixWorld);
            this._tmpNormal.subVectors(center, worldClosest);
            const dist = this._tmpNormal.length();
            if (dist > 1e-6) {
              this._tmpNormal.divideScalar(dist);
              center.addScaledVector(this._tmpNormal, radius - dist);
            } else {
              center.y += radius;
            }
            collided = true;
          }
          return false;
        },
      });
    }

    return collided;
  }

  resolveWalk(eyePosition, radius, eyeHeight) {
    let grounded = false;
    const footY = eyePosition.y - eyeHeight;

    // 1. Horizontal capsule/sphere wall push-out at waist and chest height
    const waistCenter = new THREE.Vector3(eyePosition.x, footY + radius + 0.05, eyePosition.z);
    this.resolveSphere(waistCenter, radius);
    eyePosition.x = waistCenter.x;
    eyePosition.z = waistCenter.z;

    // 2. Downward ground snap ray from waist to slightly below feet
    if (this._meshes.length > 0) {
      const rayOrigin = new THREE.Vector3(eyePosition.x, footY + eyeHeight * 0.5, eyePosition.z);
      const hit = this.raycast(rayOrigin, new THREE.Vector3(0, -1, 0), eyeHeight * 0.5 + 0.05);
      if (hit && hit.point.y >= footY - 0.05) {
        eyePosition.y = hit.point.y + eyeHeight;
        grounded = true;
      }
    }

    return grounded;
  }

  dispose() {
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
    this._meshes = [];
  }
}
