import { describe, it, expect } from 'vitest'
import {
  PRIVACY_KEY, PRIVACY_NOTICE, completionNotice, fallbackBadge, hasPrivacyAck, loadPlace, rewardView, savePlace, savePrivacyAck, sourcesView,
} from '../src/greenLensClient.js'
import { FALLBACK_LABEL, MAX_LOCATION_CHARS } from '../src/ecoQuestConfig.js'

const memoryStorage = () => {
  const data = new Map()
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) }
}
const blockedStorage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') } }

describe('privacy acknowledgement', () => {
  it('starts unacknowledged and remembers the acknowledgement', () => {
    const storage = memoryStorage()
    expect(hasPrivacyAck(storage)).toBe(false)
    expect(savePrivacyAck(storage)).toBe(true)
    expect(storage.getItem(PRIVACY_KEY)).toBe('yes')
    expect(hasPrivacyAck(storage)).toBe(true)
  })
  it('treats blocked storage as not acknowledged and never throws', () => {
    expect(hasPrivacyAck(blockedStorage)).toBe(false)
    expect(savePrivacyAck(blockedStorage)).toBe(false)
    expect(hasPrivacyAck(null)).toBe(false)
  })
  it('names the AI provider in the notice', () => {
    expect(PRIVACY_NOTICE).toMatch(/OpenRouter/)
    expect(PRIVACY_NOTICE).toMatch(/AI model/)
  })
})

describe('place', () => {
  it('trims, caps and clears the saved place', () => {
    const storage = memoryStorage()
    expect(savePlace('  Ontario  ', storage)).toBe('Ontario')
    expect(loadPlace(storage)).toBe('Ontario')
    expect(savePlace('x'.repeat(100), storage)).toHaveLength(MAX_LOCATION_CHARS)
    expect(savePlace('   ', storage)).toBe('')
    expect(loadPlace(storage)).toBe('')
    expect(loadPlace(blockedStorage)).toBe('')
  })
})

describe('fallbackBadge', () => {
  it('labels prerecorded output and leaves live output unlabelled', () => {
    expect(fallbackBadge({ live: true })).toBeNull()
    expect(fallbackBadge({ live: false })).toBe(FALLBACK_LABEL)
    expect(fallbackBadge({ live: true, fallback_label: FALLBACK_LABEL })).toBe(FALLBACK_LABEL)
    expect(fallbackBadge(null)).toBeNull()
  })
})

describe('sourcesView', () => {
  it('returns https links only, or the note when there are none', () => {
    const links = [{ title: 'EPA', publisher: 'EPA', url: 'https://www.epa.gov/recycle' }, { title: 'bad', publisher: 'x', url: 'javascript:alert(1)' }]
    expect(sourcesView({ sources: links, source_note: 'ignored' })).toEqual({ links: [links[0]], note: null })
    expect(sourcesView({ sources: [], source_note: 'No curated source covers your location' })).toEqual({ links: [], note: 'No curated source covers your location' })
    expect(sourcesView({})).toEqual({ links: [], note: null })
  })
})

describe('completionNotice', () => {
  it('has a kind message for each rejection', () => {
    for (const code of ['already_completed', 'daily_cap', 'invalid_token', 'rate_limited', 'network', 'weird']) {
      expect(completionNotice(code)).toMatch(/\w/)
    }
    expect(completionNotice('daily_cap')).toMatch(/tomorrow/)
    expect(completionNotice('invalid_token')).toMatch(/fresh/)
  })
})

describe('rewardView', () => {
  it('prefers the server reward and falls back to the table xp', () => {
    expect(rewardView({ xp: 9, coins: 14, leaves: 1 }, 5)).toEqual({ xp: 9, coins: 14, leaves: 1 })
    expect(rewardView(null, 8)).toEqual({ xp: 8, coins: 13, leaves: 1 })
    expect(rewardView(undefined, undefined)).toEqual({ xp: 0, coins: 5, leaves: 1 })
  })
})
