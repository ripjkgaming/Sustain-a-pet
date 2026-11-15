import { describe, it, expect } from 'vitest'
import { completeQuest } from '../api/eco-quest.js'
import { createCompletionStore } from '../api/_completions.js'
import { signQuestToken } from '../api/_questToken.js'
import { rewardFor } from '../src/rewards.js'

const ENV = { QUEST_SIGNING_SECRET: 'test-secret-bug-b04' }
const CID = 'client-bug-b04-1'
const now = Date.UTC(2026, 10, 15, 12)
const tok = (cid = CID) => signQuestToken({ v: 1, qid: 'ai-0000000b', cat: 'reuse', diff: 'easy', cid, iat: now, exp: now + 1e6 }, ENV.QUEST_SIGNING_SECRET)

describe('completion replay', () => {
  it('replays the original reward with 200 on a same-client retry without double counting', () => {
    const store = createCompletionStore()
    const token = tok()
    const first = completeQuest({ token, clientId: CID, env: ENV, store, now })
    const again = completeQuest({ token, clientId: CID, env: ENV, store, now: now + 1000 })
    expect(first.status).toBe(200)
    expect(again).toEqual(first)
    expect(again.body.reward).toEqual(rewardFor('reuse', 'easy'))
    expect(store.count(CID, first.body.day)).toBe(1)
  })
  it('still rejects a different client replaying the token', () => {
    const store = createCompletionStore()
    const token = tok()
    completeQuest({ token, clientId: CID, env: ENV, store, now })
    expect(completeQuest({ token, clientId: 'other-client-99', env: ENV, store, now }).status).toBe(403)
  })
})
