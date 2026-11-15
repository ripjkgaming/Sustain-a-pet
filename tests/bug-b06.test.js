import { describe, it, expect } from 'vitest'
import { gardenAction } from '../src/game.js'
import { createState } from '../src/engine.js'

const DAY = '2026-11-15'
const q = (i) => ({ object: 'Plastic bottle', title: `Quest ${i}`, action: `Action ${i}`, why: 'Saves plastic.', xp: 10, confidence: 'high' })
const add = (s, i) => gardenAction(s, { type: 'addAiQuest', quest: q(i) }, DAY)

describe('addAiQuest cap', () => {
  it('keeps open quests when over 20, dropping oldest done first', () => {
    let s = createState('Fern', DAY)
    for (let i = 0; i < 21; i++) s = add(s, i)
    expect(s.game.aiQuests).toHaveLength(21)
    expect(s.game.aiQuests.every(x => x.status === 'open')).toBe(true)
    const first = s.game.aiQuests[0]
    const second = s.game.aiQuests[1]
    s = { ...s, game: { ...s.game, aiQuests: s.game.aiQuests.map(x => x.id === second.id ? { ...x, status: 'done' } : x) } }
    s = add(s, 99)
    expect(s.game.aiQuests).toHaveLength(21)
    expect(s.game.aiQuests.some(x => x.id === first.id)).toBe(true)
    expect(s.game.aiQuests.some(x => x.id === second.id)).toBe(false)
  })
})
