import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

describe('App global key shortcuts', () => {
  it('ignore keystrokes from inside the quest dialog', () => {
    const src = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
    const line = src.split('\n').find((l) => l.includes('e.target.closest?.('))
    expect(line).toContain('.quest-screen')
  })
})
