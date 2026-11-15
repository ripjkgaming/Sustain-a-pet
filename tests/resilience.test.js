import { describe, it, expect } from 'vitest'
import { hasWebGL } from '../src/resilience.js'

const doc = (getContext) => ({ createElement: () => ({ getContext }) })

describe('hasWebGL', () => {
  it('is false without a document (no crash)', () => {
    expect(hasWebGL(null, { cache: false })).toBe(false)
  })
  it('is false when no WebGL context can be created', () => {
    expect(hasWebGL(doc(() => null), { cache: false })).toBe(false)
  })
  it('is false when getContext throws', () => {
    expect(hasWebGL(doc(() => { throw new Error('blocked') }), { cache: false })).toBe(false)
  })
  it('is true and frees the probe context when WebGL works', () => {
    let lost = false
    const gl = { getExtension: () => ({ loseContext: () => { lost = true } }) }
    expect(hasWebGL(doc((kind) => (kind === 'webgl' ? gl : null)), { cache: false })).toBe(true)
    expect(lost).toBe(true)
  })
})
