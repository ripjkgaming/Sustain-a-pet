// Deterministic reward table. Pure and shared by the server and the reducer.
// Model output never sets a reward: only category and difficulty buckets are read, and both are normalized.
export const XP_MIN = 5
export const XP_MAX = 15
export const CATEGORIES = ['reuse', 'repair', 'recycle', 'save_water', 'save_energy', 'reduce_waste', 'transport', 'other']
export const DIFFICULTIES = ['easy', 'medium', 'hard']

const BASE_XP = { reuse: 6, repair: 7, recycle: 6, save_water: 6, save_energy: 6, reduce_waste: 6, transport: 7, other: 5 }
const DIFFICULTY_BONUS = { easy: 0, medium: 2, hard: 4 }

export const normalizeCategory = (value) => (CATEGORIES.includes(value) ? value : 'other')
export const normalizeDifficulty = (value) => (DIFFICULTIES.includes(value) ? value : 'easy')

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.round(value)))

/** Reward for a quest bucket. Coins = xp + 5 and one leaf, matching the garden economy. */
export function rewardFor(category, difficulty) {
  const xp = clampInt(BASE_XP[normalizeCategory(category)] + DIFFICULTY_BONUS[normalizeDifficulty(difficulty)], XP_MIN, XP_MAX)
  return { xp, coins: xp + 5, leaves: 1 }
}

/** Accept a reward object only when it is a possible table output; otherwise null. */
export function clampReward(reward) {
  if (!reward || typeof reward !== 'object') return null
  const { xp, coins, leaves } = reward
  if (![xp, coins, leaves].every(Number.isFinite)) return null
  const safeXp = clampInt(xp, XP_MIN, XP_MAX)
  return { xp: safeXp, coins: clampInt(coins, 0, XP_MAX + 5), leaves: clampInt(leaves, 0, 1) }
}
