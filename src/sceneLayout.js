// Safe derivation of the scene layout; works before any pet exists (first visit).
export function sceneLayout(game) {
  const areas = Array.isArray(game?.areas) ? game.areas : []
  const home = areas.indexOf(game?.activeArea)
  return { count: areas.length, home: home < 0 ? 0 : home }
}
