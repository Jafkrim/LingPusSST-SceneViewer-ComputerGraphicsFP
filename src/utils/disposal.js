import * as THREE from 'three';

const TEXTURE_KEYS = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'lightMap',
  'matcap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'specularColorMap',
  'specularIntensityMap',
  'thicknessMap',
  'transmissionMap',
];

export function disposeTexture(texture, disposed = new Set()) {
  if (!texture || disposed.has(texture)) return;
  disposed.add(texture);
  texture.dispose?.();
}

export function disposeMaterial(material, disposed = new Set()) {
  if (!material || disposed.has(material)) return;
  if (Array.isArray(material)) {
    for (const mat of material) disposeMaterial(mat, disposed);
    return;
  }

  disposed.add(material);

  for (const key of TEXTURE_KEYS) {
    if (material[key]) {
      disposeTexture(material[key], disposed);
    }
  }

  if (material.uniforms && typeof material.uniforms === 'object') {
    for (const uniform of Object.values(material.uniforms)) {
      const val = uniform?.value;
      if (val instanceof THREE.Texture) {
        disposeTexture(val, disposed);
      } else if (Array.isArray(val)) {
        for (const item of val) {
          if (item instanceof THREE.Texture) disposeTexture(item, disposed);
        }
      }
    }
  }

  material.dispose?.();
}

export function disposeGeometry(geometry, disposed = new Set()) {
  if (!geometry || disposed.has(geometry)) return;
  disposed.add(geometry);
  geometry.dispose?.();
}

export function disposeObject3D(root, { removeFromParent = false, disposed = new Set() } = {}) {
  if (!root) return;

  root.traverse((node) => {
    if (node.geometry) {
      disposeGeometry(node.geometry, disposed);
    }
    if (node.material) {
      disposeMaterial(node.material, disposed);
    }
    if (typeof node.dispose === 'function' && node !== root && !node.isObject3D) {
      node.dispose();
    }
  });

  if (removeFromParent && root.parent) {
    root.parent.remove(root);
  }
}
