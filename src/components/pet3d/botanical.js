import * as THREE from 'three'
import { damp } from './shared.js'

export function createBotanicalInstance(scene, stage) {
  const root = scene.clone(true)
  const materials = new Map()
  const growth = [], foliage = []
  const cloneMaterial = (source) => {
    if (!materials.has(source)) {
      const mat = source.clone()
      mat.userData.noGlow = true
      mat.envMapIntensity = 0.45
      materials.set(source, {
        mat,
        base: mat.color.clone(),
        faded: mat.color.clone().lerp(new THREE.Color('#8f8659'), 0.55),
      })
    }
    return materials.get(source).mat
  }

  root.traverse((obj) => {
    if (obj.isMesh) obj.material = Array.isArray(obj.material) ? obj.material.map(cloneMaterial) : cloneMaterial(obj.material)
    const match = /^growth_(\d)_/.exec(obj.name)
    // glTF may split a node into material primitives with similar names.
    // Only animate the parent pivot, otherwise transforms apply twice.
    if (match && !/^growth_\d_/.test(obj.parent?.name ?? '')) {
      const from = Number(match[1])
      growth.push({ obj, from, scale: obj.scale.clone(), value: stage >= from ? 1 : 0 })
    }
    if (obj.name.includes('foliage') && !obj.parent?.name.includes('foliage')) {
      foliage.push({ obj, rotation: obj.rotation.clone() })
    }
  })
  for (const item of growth) {
    item.obj.visible = item.value > 0
    item.obj.scale.copy(item.scale).multiplyScalar(Math.max(0.0001, item.value))
  }
  return { root, materials: [...materials.values()], growth, foliage }
}

export function updateBotanicalInstance(model, { stage, state, reduced, time, dt }) {
  const { grey, droop } = state
  for (const { mat, base, faded } of model.materials) mat.color.copy(base).lerp(faded, grey)
  for (const item of model.growth) {
    item.value = reduced ? (stage >= item.from ? 1 : 0) : damp(item.value, stage >= item.from ? 1 : 0, 6, Math.min(dt, 0.05))
    item.obj.visible = item.value > 0.01
    item.obj.scale.copy(item.scale).multiplyScalar(Math.max(0.0001, item.value))
  }
  model.foliage.forEach(({ obj, rotation }, i) => {
    obj.rotation.x = rotation.x + droop * 0.48
    obj.rotation.z = rotation.z + (reduced ? 0 : Math.sin(time * 1.4 + i * 0.7) * 0.025 * (1 - droop))
  })
}
