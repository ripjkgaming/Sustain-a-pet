import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { readFileSync } from 'node:fs'
import { createBotanicalInstance, updateBotanicalInstance } from '../src/components/pet3d/botanical.js'

const sceneForTest = () => {
  const root = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color: '#328626' })
  for (let stage = 0; stage < 4; stage++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material)
    mesh.name = `growth_${stage}_foliage`
    mesh.scale.setScalar(2)
    root.add(mesh)
  }
  return root
}
const update = (model, overrides = {}) => updateBotanicalInstance(model, {
  stage: 0, state: { grey: 0, droop: 0 }, reduced: true, time: 1, dt: 1 / 60, ...overrides,
})

describe('botanical pet instances', () => {
  it('isolates material state between pets and the cached source', () => {
    const scene = sceneForTest()
    const first = createBotanicalInstance(scene, 0)
    const second = createBotanicalInstance(scene, 3)
    update(first, { state: { grey: 0.9, droop: 1 } })
    expect(first.materials[0].mat.color.equals(second.materials[0].mat.color)).toBe(false)
    expect(second.materials[0].mat.color.equals(scene.children[0].material.color)).toBe(true)
    expect(first.materials).toHaveLength(1)
    expect(first.materials[0].mat.userData.noGlow).toBe(true)
  })
  it('shows every growth stage cumulatively and restores original mesh scale', () => {
    const model = createBotanicalInstance(sceneForTest(), 0)
    expect(model.growth.map(({ obj }) => obj.visible)).toEqual([true, false, false, false])
    for (let stage = 0; stage < 4; stage++) {
      update(model, { stage })
      expect(model.growth.filter(({ obj }) => obj.visible)).toHaveLength(stage + 1)
      expect(model.growth[stage].obj.scale.x).toBe(2)
    }
  })
  it('animates a glTF pivot once when it has multiple material primitives', () => {
    const scene = new THREE.Group()
    const pivot = new THREE.Group()
    pivot.name = 'growth_1_foliage_leaf'
    const part = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    part.name = 'growth_1_foliage_leaf_1'
    pivot.add(part)
    scene.add(pivot)
    const model = createBotanicalInstance(scene, 1)
    expect(model.growth).toHaveLength(1)
    expect(model.foliage).toHaveLength(1)
  })
  it('restores healthy colors and foliage after illness without accumulating transforms', () => {
    const model = createBotanicalInstance(sceneForTest(), 3)
    update(model, { state: { grey: 0.9, droop: 1 } })
    expect(model.foliage[0].obj.rotation.x).toBeCloseTo(0.48)
    update(model)
    expect(model.foliage[0].obj.rotation.x).toBe(0)
    expect(model.materials[0].mat.color.equals(model.materials[0].base)).toBe(true)
    expect(model.materials[0].mat.emissiveIntensity).toBe(1)
    expect(model.materials[0].mat.emissive.getHex()).toBe(0)
  })
})

describe('exported Blender assets', () => {
  for (const name of ['leafling', 'mossy', 'sunbud']) {
    it(`${name} embeds textures, normals, and all four growth stages`, () => {
      const buffer = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url))
      expect(buffer.readUInt32LE(0)).toBe(0x46546c67)
      const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString())
      for (let stage = 0; stage < 4; stage++) expect(json.nodes.some((n) => n.name.startsWith(`growth_${stage}_`))).toBe(true)
      expect(json.images.every((image) => image.bufferView !== undefined && !image.uri)).toBe(true)
      expect(json.materials.some((m) => m.normalTexture)).toBe(true)
      expect(json.meshes.every((m) => m.primitives.every((p) => p.attributes.NORMAL !== undefined && p.attributes.TEXCOORD_0 !== undefined))).toBe(true)
    })
  }
})
