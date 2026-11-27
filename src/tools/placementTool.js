import * as THREE from 'three';
import defaultUiSettings from '@/config/uiSettings.json';

export class PlacementTool {
  constructor({
    canvas,
    sceneManager,
    sceneSerializer,
    assetResolver,
    camera,
    eventBus,
    batchPool = null,
    selectionTool = null,
    pawnManager = null,
    uiManager = null,
    config = defaultUiSettings,
  }) {
    if (!canvas || !sceneManager || !sceneSerializer || !assetResolver || !camera || !eventBus) {
      throw new Error(
        'PlacementTool requires canvas, sceneManager, sceneSerializer, assetResolver, camera, and eventBus.'
      );
    }

    this.canvas = canvas;
    this.sceneManager = sceneManager;
    this.sceneSerializer = sceneSerializer;
    this.assetResolver = assetResolver;
    this.camera = camera;
    this.eventBus = eventBus;
    this.batchPool = batchPool;
    this.selectionTool = selectionTool;
    this.pawnManager = pawnManager;
    this.uiManager = uiManager;
    this.config = config;

    this._activeDrag = null;
    this._dragToken = 0;
    this._raycaster = new THREE.Raycaster();
    this._raycaster.firstHitOnly = true;
    this._ndc = new THREE.Vector2();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this._unsubs = [
      this.eventBus.on('content:dragStart', (payload) => this._onDragStart(payload)),
      this.eventBus.on('content:dragMove', (payload) => this._onDragMove(payload)),
      this.eventBus.on('content:dragEnd', (payload) => this._onDragEnd(payload)),
      this.eventBus.on('render:beforeFrame', () => {
        if (this._activeDrag?.needsRaycast && this._activeDrag.lastClient) {
          this._activeDrag.needsRaycast = false;
          this._updateEntityAtClient(
            this._activeDrag.lastClient.x,
            this._activeDrag.lastClient.y
          );
        }
      }),
      this.eventBus.on('input:action:down', ({ action } = {}) => {
        if (action === 'tool.cancel' && this._activeDrag) {
          this._cancelDrag();
        }
      }),
    ].filter(Boolean);
  }

  _getConfig() {
    return {
      ...defaultUiSettings.placementTool,
      ...(this.config?.placementTool ?? {}),
    };
  }

  _isPlaceableItem(item) {
    if (!item?.logicalPath) return false;
    const cfg = this._getConfig();
    const allowed = cfg.allowedCategories ?? [];
    if (item.category && allowed.includes(item.category)) return true;

    const lower = item.logicalPath.toLowerCase();
    return lower.endsWith('.glb') || lower.endsWith('.gltf') || lower.endsWith('.prefab.json');
  }

  _clientToCanvasNdc(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { inside: false, ndcX: 0, ndcY: 0 };
    }
    const inside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;

    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    return { inside, ndcX, ndcY };
  }

  _computeEntityBottomOffsetY(entityObj) {
    if (!entityObj) return 0;

    const entityId = entityObj.userData?.entityId;
    if (entityObj.userData?.isBatchedProxy && entityId && this.batchPool) {
      const localBox = this.batchPool.getProxyLocalBounds(entityId);
      if (localBox && !localBox.isEmpty() && Number.isFinite(localBox.min.y)) {
        return Math.max(0, -localBox.min.y);
      }
      return 0;
    }

    const box = new THREE.Box3().setFromObject(entityObj);
    if (!box.isEmpty() && Number.isFinite(box.min.y)) {
      return Math.max(0, -box.min.y - entityObj.position.y);
    }
    return 0;
  }

  _findNearestTriangleVertex(hit, radius) {
    const geo = hit.object?.geometry;
    const face = hit.face;
    if (!geo || !face || !geo.attributes?.position) return null;

    const posAttr = geo.attributes.position;
    const indices = [face.a, face.b, face.c];
    const worldMat = new THREE.Matrix4().copy(hit.object.matrixWorld);

    if (hit.object.isBatchedMesh && hit.batchId !== undefined && hit.batchId !== null) {
      const instanceMat = new THREE.Matrix4();
      hit.object.getMatrixAt(hit.batchId, instanceMat);
      worldMat.multiply(instanceMat);
    }

    let bestPoint = null;
    let bestDistSq = radius * radius;
    const vtx = new THREE.Vector3();

    for (const idx of indices) {
      if (idx === undefined || idx < 0 || idx >= posAttr.count) continue;
      vtx.fromBufferAttribute(posAttr, idx).applyMatrix4(worldMat);
      const dSq = vtx.distanceToSquared(hit.point);
      if (dSq <= bestDistSq) {
        bestDistSq = dSq;
        bestPoint = vtx.clone();
      }
    }

    return bestPoint;
  }

  _isHitSelf(hit, draggedEntity) {
    if (!draggedEntity || !hit?.object) return false;

    if (hit.object.isBatchedMesh && this.batchPool) {
      const hitProxy = this.batchPool.resolveEntityFromHit(hit.object, hit.batchId);
      return hitProxy === draggedEntity;
    }

    let curr = hit.object;
    while (curr) {
      if (curr === draggedEntity) return true;
      curr = curr.parent;
    }
    return false;
  }

  _computePlacementPosition(ndcX, ndcY, minBottomOffsetY, draggedEntity) {
    const cfg = this._getConfig();
    this._ndc.set(ndcX, ndcY);
    this._raycaster.setFromCamera(this._ndc, this.camera);

    // 1. Raycast against existing scene objects (ignoring the entity currently being dragged)
    if (cfg.snapToSurface) {
      const targets = [];
      if (this.batchPool?.batchRoot) targets.push(this.batchPool.batchRoot);
      if (this.sceneManager.worldGroup) targets.push(this.sceneManager.worldGroup);

      const hits = this._raycaster.intersectObjects(targets, true);
      for (const hit of hits) {
        if (hit.object?.userData?.isViewportGuide || hit.object?.userData?.excludeFromHierarchy) {
          continue;
        }
        if (this._isHitSelf(hit, draggedEntity)) {
          continue;
        }

        let snapPoint = hit.point.clone();
        if (cfg.snapToNearestVertex) {
          const nearestVtx = this._findNearestTriangleVertex(hit, cfg.vertexSnapRadius);
          if (nearestVtx) {
            snapPoint = nearestVtx;
          }
        }

        snapPoint.y += minBottomOffsetY;
        return snapPoint;
      }
    }

    // 2. Raycast against Y=0 ground plane when pointing downward within maxGroundDistance
    const groundHit = new THREE.Vector3();
    const hitGround = this._raycaster.ray.intersectPlane(this._groundPlane, groundHit);
    if (hitGround && groundHit.distanceTo(this.camera.position) <= cfg.maxGroundDistance) {
      groundHit.y += minBottomOffsetY;
      return groundHit;
    }

    // 3. Unreal Engine empty-space fallback: project forward along camera ray
    return this._raycaster.ray.origin
      .clone()
      .addScaledVector(this._raycaster.ray.direction, cfg.defaultDropDistance);
  }

  async _ensureSpawnedForDrag(drag) {
    if (drag.entity || drag.spawning) return;
    drag.spawning = true;

    try {
      const spawned = await this.sceneSerializer.spawnEntityFromAsset(drag.item.logicalPath, {
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      });

      if (!this._activeDrag || this._activeDrag.token !== drag.token) {
        if (spawned?.userData?.entityId) {
          this.sceneManager.removeEntity(spawned.userData.entityId);
        }
        return;
      }

      drag.entity = spawned;
      drag.minBottomOffsetY = this._computeEntityBottomOffsetY(spawned);

      if (drag.lastClient) {
        this._updateEntityAtClient(drag.lastClient.x, drag.lastClient.y);
      }
    } catch (err) {
      console.error('Failed to spawn dragged asset:', err);
      if (this._activeDrag?.token === drag.token) {
        this._cancelDrag();
      }
    } finally {
      drag.spawning = false;
    }
  }

  _updateEntityAtClient(clientX, clientY) {
    const drag = this._activeDrag;
    if (!drag) return;

    drag.lastClient = { x: clientX, y: clientY };
    const { inside, ndcX, ndcY } = this._clientToCanvasNdc(clientX, clientY);
    drag.insideViewport = inside;

    if (!inside) {
      if (drag.entity) {
        drag.entity.visible = false;
      }
      return;
    }

    if (!drag.entity) {
      this._ensureSpawnedForDrag(drag);
      return;
    }

    drag.entity.visible = true;
    const pos = this._computePlacementPosition(
      ndcX,
      ndcY,
      drag.minBottomOffsetY,
      drag.entity
    );
    drag.entity.position.copy(pos);
    drag.entity.updateMatrixWorld(true);
  }

  _onDragStart({ item, clientX, clientY } = {}) {
    if (this.uiManager?.settingsPanel?.visible) return;
    if (!this._isPlaceableItem(item)) return;

    if (this.pawnManager && this.pawnManager.activeMode !== 'surveyor') {
      this.pawnManager.setMode('surveyor');
    }

    this.selectionTool?.clearSelection?.();

    const token = ++this._dragToken;
    this._activeDrag = {
      item,
      token,
      entity: null,
      spawning: false,
      minBottomOffsetY: 0,
      insideViewport: false,
      lastClient: null,
    };

    if (typeof clientX === 'number' && typeof clientY === 'number') {
      this._updateEntityAtClient(clientX, clientY);
    }
  }

  _onDragMove({ clientX, clientY } = {}) {
    if (!this._activeDrag) return;
    if (typeof clientX === 'number' && typeof clientY === 'number') {
      this._activeDrag.lastClient = { x: clientX, y: clientY };
      this._activeDrag.needsRaycast = true;
    }
  }

  _onDragEnd({ clientX, clientY, cancelled } = {}) {
    const drag = this._activeDrag;
    if (!drag) return;

    if (!cancelled && typeof clientX === 'number' && typeof clientY === 'number') {
      this._updateEntityAtClient(clientX, clientY);
    }

    const placedEntity = !cancelled && drag.insideViewport ? drag.entity : null;

    if (!placedEntity && drag.entity?.userData?.entityId) {
      this.sceneManager.removeEntity(drag.entity.userData.entityId);
    }

    this._dragToken += 1;
    this._activeDrag = null;

    if (placedEntity) {
      placedEntity.visible = true;
      this.selectionTool?.selectObject?.(placedEntity);
      this.eventBus.emit('scene:changed', {
        reason: 'place',
        id: placedEntity.userData?.entityId ?? placedEntity.uuid,
      });
    }
  }

  _cancelDrag() {
    const drag = this._activeDrag;
    this._dragToken += 1;
    this._activeDrag = null;

    if (drag?.entity?.userData?.entityId) {
      this.sceneManager.removeEntity(drag.entity.userData.entityId);
    }
  }

  dispose() {
    this._cancelDrag();
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
  }
}
