import { describe, it, expect } from 'vitest'
import { validateQuest, MAX_AI_QUESTS_PER_DAY, QUEST_SCHEMA } from '../src/ecoQuest.js'
import { gardenAction, migrateGame } from '../src/game.js'
import { reduce } from '../src/store.js'
import { createState, addDays } from '../src/engine.js'

const DAY = '2026-11-15'
const fresh = () => createState('Fern', DAY)
const goodQuest = {
  object: 'Plastic bottle',
  title: 'Refill your bottle',
  action: 'Refill a reusable bottle at a tap today.',
  why: 'Saves single-use plastic.',
  xp: 10,
  confidence: 'high',
}
const addQuest = (state, quest, today = DAY) => gardenAction(state, { type: 'addAiQuest', quest }, today)
const SERVER_REWARD = { xp: 12, coins: 17, leaves: 1 }
const completeQ = (state, id, today = DAY, reward = SERVER_REWARD) => gardenAction(state, { type: 'completeAiQuest', id, reward }, today)
const withGame = (state, game) => ({ ...state, game: { ...state.game, ...game } })
const distinct = (i) => ({ ...goodQuest, title: `Quest ${i}`, action: `Action ${i}` })

describe('validateQuest', () => {
  it('accepts a good quest with a deterministic ai-<8 hex> id', () => {
    const v = validateQuest(goodQuest)
    expect(v.ok).toBe(true)
    expect(v.quest.id).toMatch(/^ai-[0-9a-f]{8}$/)
    expect(validateQuest({ ...goodQuest }).quest.id).toBe(v.quest.id)
    expect(validateQuest({ ...goodQuest, title: 'Other title' }).quest.id).not.toBe(v.quest.id)
  })
  it('ignores model-supplied xp and derives it from category and difficulty', () => {
    expect(validateQuest({ ...goodQuest, xp: 99 }).quest.xp).toBe(5)
    expect(validateQuest({ ...goodQuest, xp: 99, reward: { coins: 999 }, coins: 999 }).quest).not.toHaveProperty('coins')
    expect(validateQuest({ ...goodQuest, category: 'repair', difficulty: 'hard' }).quest.xp).toBe(11)
    expect(validateQuest({ ...goodQuest, category: 'nonsense', difficulty: 'nope' }).quest).toMatchObject({ category: 'other', difficulty: 'easy', xp: 5 })
  })
  it('truncates long strings to their field limits', () => {
    expect(validateQuest({ ...goodQuest, title: 'x'.repeat(200) }).quest.title).toHaveLength(80)
    expect(validateQuest({ ...goodQuest, why: 'x'.repeat(400) }).quest.why).toHaveLength(300)
    expect(validateQuest({ ...goodQuest, object: 'x'.repeat(100) }).quest.object).toHaveLength(60)
    expect(validateQuest({ ...goodQuest, action: 'x'.repeat(500) }).quest.action).toHaveLength(200)
  })
  it('strips html tags and collapses whitespace', () => {
    const v = validateQuest({ ...goodQuest, title: '<b>Bold</b> <script>alert(1)</script>Tree' })
    expect(v.ok).toBe(true)
    expect(v.quest.title).not.toContain('<')
    expect(v.quest.title).toContain('Bold')
    expect(validateQuest({ ...goodQuest, why: '  a \n\t b  ' }).quest.why).toBe('a b')
  })
  it('rejects denylisted content in any text field', () => {
    expect(validateQuest({ ...goodQuest, action: 'Drink a bleach solution' })).toEqual({ ok: false, error: 'denied-content' })
    expect(validateQuest({ ...goodQuest, why: 'poison the soil' })).toEqual({ ok: false, error: 'denied-content' })
    expect(validateQuest({ ...goodQuest, caveat: 'Do not swallow it' })).toEqual({ ok: false, error: 'denied-content' })
  })
  it('rejects bad types and empty required fields', () => {
    expect(validateQuest(null)).toEqual({ ok: false, error: 'not-object' })
    expect(validateQuest([])).toEqual({ ok: false, error: 'not-object' })
    expect(validateQuest('str')).toEqual({ ok: false, error: 'not-object' })
    expect(validateQuest({ ...goodQuest, title: 42 })).toEqual({ ok: false, error: 'bad-type:title' })
    expect(validateQuest({ ...goodQuest, confidence: 'maybe' })).toEqual({ ok: false, error: 'bad-type:confidence' })
    expect(validateQuest({ ...goodQuest, title: '   ' })).toEqual({ ok: false, error: 'empty:title' })
    expect(validateQuest({ ...goodQuest, why: undefined })).toEqual({ ok: false, error: 'empty:why' })
  })
  it('handles optional caveat', () => {
    expect(validateQuest(goodQuest).quest.caveat).toBeUndefined()
    expect(validateQuest({ ...goodQuest, caveat: 'x'.repeat(300) }).quest.caveat).toHaveLength(160)
    expect(validateQuest({ ...goodQuest, caveat: 42 })).toEqual({ ok: false, error: 'bad-type:caveat' })
  })
  it('ignores raw id and unknown fields', () => {
    const v = validateQuest({ ...goodQuest, id: 'ai-deadbeef', secret: 'x' })
    expect(v.quest.id).not.toBe('ai-deadbeef')
    expect(v.quest).not.toHaveProperty('secret')
  })
})

describe('QUEST_SCHEMA and constants', () => {
  it('lets the model choose buckets but never an id, reward or link', () => {
    expect(QUEST_SCHEMA.type).toBe('object')
    for (const field of ['id', 'xp', 'coins', 'reward', 'url', 'sources']) expect(QUEST_SCHEMA.properties).not.toHaveProperty(field)
    expect(QUEST_SCHEMA.required).toEqual(expect.arrayContaining(['clarifying_question', 'category', 'difficulty', 'personalization_note']))
  })
  it('caps AI quest completions at 3 per day', () => {
    expect(MAX_AI_QUESTS_PER_DAY).toBe(3)
  })
})

describe('addAiQuest', () => {
  it('adds an open quest stamped with today', () => {
    const s = addQuest(fresh(), goodQuest)
    expect(s.game.aiQuests).toHaveLength(1)
    expect(s.game.aiQuests[0]).toMatchObject({ title: 'Refill your bottle', createdOn: DAY, status: 'open' })
  })
  it('dedupes by id and returns the same state', () => {
    const once = addQuest(fresh(), goodQuest)
    expect(addQuest(once, goodQuest)).toBe(once)
  })
  it('ignores invalid quests', () => {
    const s = fresh()
    expect(addQuest(s, { ...goodQuest, action: 'Drink a bleach solution' })).toBe(s)
  })
  it('never drops open quests when the list passes 20', () => {
    let s = fresh()
    for (let i = 0; i < 22; i++) s = addQuest(s, distinct(i))
    expect(s.game.aiQuests).toHaveLength(22)
    expect(s.game.aiQuests[0].title).toBe('Quest 0')
  })
  it('treats undefined aiQuests as empty', () => {
    const s = withGame(fresh(), { aiQuests: undefined })
    expect(addQuest(s, goodQuest).game.aiQuests).toHaveLength(1)
  })
})

describe('completeAiQuest', () => {
  it('pays exact rewards: coins xp+5, one leaf, lifetime xp, pet xp, health +5', () => {
    const base = { ...withGame(fresh(), { coins: 100, leaves: 5, lifetimeXp: 40 }), xp: 20, health: 50 }
    const added = addQuest(base, { ...goodQuest, xp: 12 }) // quest xp is not what pays: the server reward is
    const id = added.game.aiQuests[0].id
    const done = completeQ(added, id)
    expect(done.game.coins).toBe(117)
    expect(done.game.leaves).toBe(6)
    expect(done.game.lifetimeXp).toBe(52)
    expect(done.xp).toBe(32)
    expect(done.health).toBe(55)
    expect(done.game.aiQuests[0].status).toBe('done')
  })
  it('pays the server reward, not the quest xp, and rejects a missing or absurd reward', () => {
    const added = addQuest(fresh(), goodQuest)
    const id = added.game.aiQuests[0].id
    expect(completeQ(added, id, DAY, { xp: 15, coins: 20, leaves: 1 }).game.coins).toBe(added.game.coins + 20)
    expect(completeQ(added, id, DAY, { xp: 9999, coins: 9999, leaves: 99 }).game.coins).toBe(added.game.coins + 20)
    expect(gardenAction(added, { type: 'completeAiQuest', id }, DAY)).toBe(added)
    expect(completeQ(added, id, DAY, 'rich')).toBe(added)
  })
  it('caps health at 100', () => {
    const base = { ...addQuest(fresh(), goodQuest), health: 98 }
    expect(completeQ(base, base.game.aiQuests[0].id).health).toBe(100)
  })
  it('completes once only', () => {
    const added = addQuest(fresh(), goodQuest)
    const id = added.game.aiQuests[0].id
    const done = completeQ(added, id)
    expect(completeQ(done, id)).toBe(done)
  })
  it('no-op on unknown id', () => {
    const added = addQuest(fresh(), goodQuest)
    expect(completeQ(added, 'ai-00000000')).toBe(added)
  })
  it('enforces the daily cap of 3 and resets on a new day', () => {
    let s = fresh()
    for (let i = 0; i < 4; i++) s = addQuest(s, distinct(i))
    const ids = s.game.aiQuests.map(q => q.id)
    for (let i = 0; i < MAX_AI_QUESTS_PER_DAY; i++) s = completeQ(s, ids[i])
    expect(s.game.aiDaily).toEqual({ date: DAY, count: 3 })
    expect(completeQ(s, ids[3])).toBe(s)
    const nextDay = addDays(DAY, 1)
    const next = completeQ(s, ids[3], nextDay)
    expect(next.game.aiDaily).toEqual({ date: nextDay, count: 1 })
    expect(next.game.aiQuests[3].status).toBe('done')
  })
  it('rejects completion when the clock went backwards', () => {
    const added = { ...addQuest(fresh(), goodQuest), lastOpenDate: addDays(DAY, 1) }
    expect(completeQ(added, added.game.aiQuests[0].id, DAY)).toBe(added)
  })
  it('handles undefined aiQuests and aiDaily without throwing', () => {
    const { aiQuests: _aiQuests, aiDaily: _aiDaily, ...rest } = fresh().game
    const s = { ...fresh(), game: rest }
    expect(completeQ(s, 'ai-00000000')).toBe(s)
    expect(addQuest(s, goodQuest).game.aiQuests).toHaveLength(1)
  })
})

describe('migration safety', () => {
  it('legacy save without game gets migrated and then accepts AI quests', () => {
    const legacy = fresh()
    delete legacy.game
    const migrated = migrateGame(legacy)
    expect(migrated.game.aiQuests).toBeUndefined()
    expect(addQuest(migrated, goodQuest).game.aiQuests).toHaveLength(1)
  })
})

describe('store reducer ai quest events', () => {
  it('emits aiQuest only when a quest becomes done, and not twice', () => {
    const app0 = reduce({ real: null, events: [], awayDays: 0, nonce: 0 }, { type: 'hatch', name: 'Pip', sprite: 'mossy' })
    const app1 = reduce(app0, { type: 'addAiQuest', quest: goodQuest })
    expect(app1.events.some(e => e.type === 'aiQuest')).toBe(false)
    const id = app1.real.game.aiQuests[0].id
    const app2 = reduce(app1, { type: 'completeAiQuest', id, reward: SERVER_REWARD })
    expect(app2.events).toContainEqual({ type: 'aiQuest', xp: 12, title: 'Refill your bottle' })
    expect(reduce(app2, { type: 'completeAiQuest', id, reward: SERVER_REWARD })).toBe(app2)
  })
})
