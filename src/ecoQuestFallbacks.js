// Prerecorded generic tips used when the live model times out or fails. Never presented as live AI output.
// Same shape as a validated model quest (before server-side rewards and ids are added).
export const FALLBACK_QUESTS = [
  { object: 'Everyday drink container', title: 'Carry a refillable bottle', action: 'Fill a reusable bottle from the tap before you head out today.', why: 'Each refill replaces a single-use bottle.', category: 'reuse', difficulty: 'easy', confidence: 'low', caveat: 'Prerecorded tip: not based on your photo or note.', personalization_note: null },
  { object: 'Lights and devices', title: 'Switch off standby', action: 'Unplug one charger or switch off one device you are not using right now.', why: 'Idle devices still draw a little power.', category: 'save_energy', difficulty: 'easy', confidence: 'low', caveat: 'Prerecorded tip: not based on your photo or note.', personalization_note: null },
  { object: 'Tap or shower', title: 'Trim your water use', action: 'Turn the tap off while you brush your teeth today.', why: 'It saves several litres each time.', category: 'save_water', difficulty: 'easy', confidence: 'low', caveat: 'Prerecorded tip: not based on your photo or note.', personalization_note: null },
  { object: 'Something worn or broken', title: 'Try a small repair first', action: 'Pick one item that is easy to fix, such as a loose button, and mend it instead of replacing it.', why: 'Repairing keeps items in use for longer.', category: 'repair', difficulty: 'medium', confidence: 'low', caveat: 'Prerecorded tip: not based on your photo or note.', personalization_note: null },
  { object: 'Household recycling', title: 'Check your local recycling rules', action: 'Look up your local council recycling guide and check one item you were unsure about.', why: 'Rules differ by area, and wrong items can spoil a recycling load.', category: 'recycle', difficulty: 'easy', confidence: 'low', caveat: 'Prerecorded tip: not based on your photo or note.', personalization_note: null },
]

function fnv(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Deterministic pick: the same input text and image size always yield the same tip. */
export function pickFallback(seedText = '', imageLength = 0) {
  return { ...FALLBACK_QUESTS[fnv(`${seedText}|${imageLength}`) % FALLBACK_QUESTS.length] }
}
