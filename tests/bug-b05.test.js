import { describe, it, expect } from 'vitest'
import { createState } from '../src/engine.js'
import { gardenAction } from '../src/game.js'
const DAY = '2026-11-15'
const q = (token) => ({ object: 'bag', title: 'Swap one bag for a tote', action: 'Carry a tote bag to the shop today.', why: 'Fewer bags.', category: 'waste', difficulty: 'easy', confidence: 'high', token })
describe('refreshAiQuestToken', () => {
  it('replaces stale token on open quest', () => {
    let s = createState('Fern', DAY)
    s = gardenAction(s, { type: 'addAiQuest', quest: q('old') }, DAY)
    expect(s.game.aiQuests).toHaveLength(1)
    const id = s.game.aiQuests[0].id
    s = gardenAction(s, { type: 'refreshAiQuestToken', quest: q('new') }, DAY)
    expect(s.game.aiQuests[0]).toMatchObject({ id, token: 'new', status: 'open' })
  })
  it('ignores unknown quest', () => {
    const s = createState('Fern', DAY)
    expect(gardenAction(s, { type: 'refreshAiQuestToken', quest: q('new') }, DAY)).toBe(s)
  })
})
