// The garden economy is pure and shared across companions; switching never resets daily limits.
export const SHOP = [
  { id: 'dew', name: 'Morning dew', description: 'Restore 18 health to your active companion.', cost: 25, kind: 'care', health: 18, icon: '💧' },
  { id: 'compost', name: 'Leaf compost', description: 'Restore 35 health and nurture your companion with 8 XP.', cost: 45, kind: 'care', health: 35, xp: 8, icon: '🌱' },
  { id: 'lantern', name: 'Firefly lantern', description: 'Place a warm lantern in every garden you visit.', cost: 65, kind: 'decoration', icon: '🏮' },
  { id: 'flowers', name: 'Wildflower patch', description: 'Plant a colourful cluster beside the garden path.', cost: 45, kind: 'decoration', icon: '🌼' },
  { id: 'bench', name: 'Little garden bench', description: 'Give your companions a quiet place to rest.', cost: 90, kind: 'decoration', icon: '🪑' },
]
export const PET_CATALOG = [
  { id: 'leafling', name: 'Leafling', sprite: 'leafling', cost: 100, description: 'A curious little friend with a crown of leaves.', icon: '🌱' },
  { id: 'mossy', name: 'Mossy', sprite: 'mossy', cost: 100, description: 'A gentle moss-covered garden explorer.', icon: '🌿' },
  { id: 'sunbud', name: 'Sunbud', sprite: 'sunbud', cost: 140, description: 'A sunny blossom who brightens every clearing.', icon: '🌻' },
]
export const AREAS = [
  { id: 'meadow', name: 'Fernlight Meadow', description: 'Your first little patch of green. Restore its forgotten corners.', cost: 0, leaves: 0, xp: 0, icon: '🌿' },
  { id: 'pond', name: 'Willow Pond', description: 'A peaceful waterside garden with lilies and stepping stones.', cost: 120, leaves: 6, xp: 60, requires: 'meadow-bed', icon: '🪷' },
  { id: 'grove', name: 'Amber Grove', description: 'A golden woodland clearing waiting for a new beginning.', cost: 220, leaves: 12, xp: 150, requires: 'pond-bridge', icon: '🍂' },
]
export const PROJECTS = [
  { id: 'meadow-bed', area: 'meadow', name: 'Replant the flower bed', description: 'Bring wildflowers back to the meadow.', cost: 40, leaves: 3, reward: 20, icon: '🌷' },
  { id: 'meadow-fountain', area: 'meadow', name: 'Restore the stone birdbath', description: 'Bring fresh water back for the meadow birds.', cost: 70, leaves: 5, reward: 30, requires: 'meadow-bed', icon: '⛲' },
  { id: 'pond-bridge', area: 'pond', name: 'Mend the footbridge', description: 'Connect the banks with a tiny wooden crossing.', cost: 80, leaves: 5, reward: 35, icon: '🌉' },
  { id: 'pond-lilies', area: 'pond', name: 'Welcome the water lilies', description: 'Let blossoms settle on the quiet water.', cost: 100, leaves: 7, reward: 40, requires: 'pond-bridge', icon: '🪷' },
  { id: 'grove-tree', area: 'grove', name: 'Nurture the wishing tree', description: 'Help a young tree take root in the grove.', cost: 120, leaves: 8, reward: 50, icon: '🌳' },
  { id: 'grove-picnic', area: 'grove', name: 'Make a woodland gathering', description: 'Finish a welcoming home for your whole companion family.', cost: 160, leaves: 10, reward: 60, requires: 'grove-tree', icon: '🧺' },
]
export function createGame(pet) {
  return { coins: 80, leaves: 0, inventory: {}, decorations: [], pets: [{ id: pet.sprite, name: pet.name, sprite: pet.sprite }], activePet: pet.sprite, areas: ['meadow'], activeArea: 'meadow', projects: [], daily: { lastClaim: null, streak: 0, total: 0 }, tasks: {}, lifetimeXp: 0 }
}
export function migrateGame(state) {
  if (!state || state.version !== 1 || !state.pet) return null
  if (state.game) return state
  return { ...state, game: { ...createGame(state.pet), lifetimeXp: state.xp ?? 0 } }
}
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)
export function dailyRewardFor(state, today) {
  const daily = state.game.daily
  const gap = daily.lastClaim ? dayDiff(daily.lastClaim, today) : 1
  const available = today >= state.lastOpenDate && (!daily.lastClaim || gap > 0)
  const streak = available ? (gap === 1 ? daily.streak + 1 : 1) : daily.streak
  const day = ((streak - 1) % 7) + 1
  return { available, streak, day, coins: 25 + day * 5, leaves: day === 7 ? 5 : 1 }
}
export function questProgress(state, today) {
  const day = state.days[today]
  const done = (day?.habits.length ?? 0) + (day?.quiz && !day.habits.includes('quiz') ? 1 : 0)
  const claimed = state.game.tasks[today] ?? []
  return [
    { id: 'three', name: 'Small steps, greener world', description: 'Complete 3 real-life habits today.', progress: Math.min(done, 3), target: 3, coins: 30, leaves: 2 },
    { id: 'all', name: 'A garden full of good', description: 'Complete 7 habits and try today’s quiz. Learning counts too.', progress: done, target: 8, coins: 60, leaves: 4 },
  ].map(q => ({ ...q, claimed: claimed.includes(q.id), complete: q.progress >= q.target }))
}
export function awardGarden(state, xp) {
  if (!state.game) return state
  return { ...state, game: { ...state.game, coins: state.game.coins + xp + 5, leaves: state.game.leaves + 1, lifetimeXp: (state.game.lifetimeXp ?? 0) + xp } }
}
export function gardenAction(state, action, today) {
  if (!state?.game) return state
  const g = state.game
  const patch = (change, extra = {}) => ({ ...state, ...extra, game: { ...g, ...change } })
  const afford = item => Number.isFinite(item.cost) && g.coins >= item.cost && g.leaves >= (item.leaves ?? 0)
  switch (action.type) {
    case 'claimDaily': {
      const r = dailyRewardFor(state, today)
      if (!r.available) return state
      return patch({ coins: g.coins + r.coins, leaves: g.leaves + r.leaves, daily: { lastClaim: today, streak: r.streak, total: g.daily.total + 1 } })
    }
    case 'buy': {
      const item = SHOP.find(i => i.id === action.id)
      if (!item || !afford(item) || (item.kind === 'decoration' && g.inventory[item.id])) return state
      return patch({ coins: g.coins - item.cost, inventory: { ...g.inventory, [item.id]: (g.inventory[item.id] ?? 0) + 1 }, decorations: item.kind === 'decoration' ? [...g.decorations, item.id] : g.decorations })
    }
    case 'useItem': {
      const item = SHOP.find(i => i.id === action.id)
      if (!item || !g.inventory[item.id]) return state
      if (item.kind === 'decoration') return patch({ decorations: g.decorations.includes(item.id) ? g.decorations.filter(id => id !== item.id) : [...g.decorations, item.id] })
      if (state.health >= 100) return state
      return patch({ inventory: { ...g.inventory, [item.id]: g.inventory[item.id] - 1 }, lifetimeXp: (g.lifetimeXp ?? 0) + (item.xp ?? 0) }, { health: Math.min(100, state.health + item.health), xp: state.xp + (item.xp ?? 0) })
    }
    case 'adopt': {
      const item = PET_CATALOG.find(i => i.id === action.id)
      if (!item || !afford(item) || g.pets.some(p => p.id === item.id)) return state
      return patch({ coins: g.coins - item.cost, pets: [...g.pets, { id: item.id, name: item.name, sprite: item.sprite, xp: 0, health: 80 }] })
    }
    case 'switchPet': {
      const pet = g.pets.find(p => p.id === action.id)
      if (!pet || pet.id === g.activePet) return state
      return patch({ activePet: pet.id, pets: g.pets.map(p => p.id === g.activePet ? { ...p, xp: state.xp, health: state.health } : p) }, { pet: { ...state.pet, name: pet.name, sprite: pet.sprite }, xp: pet.xp ?? 0, health: pet.health ?? 80 })
    }
    case 'unlockArea': {
      const item = AREAS.find(i => i.id === action.id)
      if (!item || g.areas.includes(item.id) || !afford(item) || (g.lifetimeXp ?? state.xp) < item.xp || (item.requires && !g.projects.includes(item.requires))) return state
      return patch({ coins: g.coins - item.cost, leaves: g.leaves - item.leaves, areas: [...g.areas, item.id], activeArea: item.id })
    }
    case 'visitArea':
      return g.areas.includes(action.id) && action.id !== g.activeArea ? patch({ activeArea: action.id }) : state
    case 'restore': {
      const item = PROJECTS.find(i => i.id === action.id)
      if (!item || !g.areas.includes(item.area) || g.projects.includes(item.id) || !afford(item) || (item.requires && !g.projects.includes(item.requires))) return state
      return patch({ coins: g.coins - item.cost, leaves: g.leaves - item.leaves, projects: [...g.projects, item.id], lifetimeXp: (g.lifetimeXp ?? 0) + item.reward }, { xp: state.xp + item.reward })
    }
    case 'claimQuest': {
      if (today < state.lastOpenDate) return state
      const q = questProgress(state, today).find(q => q.id === action.id)
      if (!q || !q.complete || q.claimed) return state
      return patch({ coins: g.coins + q.coins, leaves: g.leaves + q.leaves, tasks: { ...g.tasks, [today]: [...(g.tasks[today] ?? []), q.id] } })
    }
    default: return state
  }
}
