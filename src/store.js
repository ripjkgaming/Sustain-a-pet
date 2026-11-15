// App state: useReducer over engine.js, persisted to localStorage (in-memory fallback).
import { useEffect, useReducer } from 'react'
import {
  allHabitsDone, answerQuiz, createState, dateKey, daysBetween, logHabit, moodFor, rollover, stageIndex,
} from './engine.js'

import { gardenAction, migrateGame } from './game.js'

const REAL_KEY = 'sustain-a-pet'

const memory = {}
const storage = {
  get(key) {
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch {
      return memory[key] ?? null
    }
  },
  set(key, value) {
    memory[key] = value
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage blocked: memory copy keeps the app working */
    }
  },
  remove(key) {
    delete memory[key]
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

const realToday = () => dateKey(new Date())
export const todayOf = () => realToday()
export const activeOf = (app) => app.real

function load() {
  const app = { real: migrateGame(storage.get(REAL_KEY)), events: [], awayDays: 0, nonce: 0 }
  return reduce(app, { type: 'open' })
}

/** Diff two pet states into reward events the UI can play. */
function diffEvents(before, after, today) {
  const ev = []
  if (!before || !after || before === after) return ev
  const habitNow = after.days[today]?.habits ?? []
  const habitBefore = before.days[today]?.habits ?? []
  const newHabit = habitNow.find((h) => !habitBefore.includes(h))
  if (newHabit) ev.push({ type: 'tick', habit: newHabit, xp: after.xp - before.xp, health: after.health - before.health })
  if (after.days[today]?.quiz && !before.days[today]?.quiz) {
    ev.push({ type: after.days[today].quiz === 'correct' ? 'quizCorrect' : 'quizWrong' })
  }
  if (after.game?.activePet === before.game?.activePet && stageIndex(after.xp) > stageIndex(before.xp)) ev.push({ type: 'stageUp', stage: stageIndex(after.xp) })
  for (const id of after.unlocked) if (!before.unlocked.includes(id)) ev.push({ type: 'unlock', id })
  if (moodFor(after.health) !== moodFor(before.health)) ev.push({ type: 'mood', mood: moodFor(after.health), from: moodFor(before.health) })
  if (after.game !== before.game && after.game && before.game) {
    const gain = after.game.coins - before.game.coins
    if (gain > 0) ev.push({ type: 'game', text: `+${gain} coins · ${after.game.leaves - before.game.leaves > 0 ? `+${after.game.leaves - before.game.leaves} ${after.game.leaves - before.game.leaves === 1 ? 'leaf' : 'leaves'}` : 'Garden reward'}` })
    else if (after.game.projects.length > before.game.projects.length) ev.push({ type: 'game', text: 'Restoration complete! Your garden is growing.' })
    else if (after.game.pets.length > before.game.pets.length) ev.push({ type: 'game', text: 'A new companion has joined your garden!' })
    else if (after.game.inventory !== before.game.inventory) ev.push({ type: 'game', text: 'Your garden supplies are ready.' })
    else if (after.game.activeArea !== before.game.activeArea) ev.push({ type: 'game', text: 'Welcome to your next garden.' })
  }
  if (allHabitsDone(after, today) && !allHabitsDone(before, today)) ev.push({ type: 'allDone' })
  return ev
}

function withPet(app, update) {
  const today = todayOf(app)
  const before = activeOf(app)
  const after = update(before, today)
  if (after === before) return app
  return { ...app, real: after, events: diffEvents(before, after, today), nonce: app.nonce + 1 }
}

export function reduce(app, action) {
  switch (action.type) {
    case 'open': {
      // On open/focus: apply decay for days away; remember how long for the welcome-back line.
      if (!app.real) return app
      const today = todayOf(app)
      const away = daysBetween(app.real.lastOpenDate, today)
      const state = rollover(app.real, today)
      if (state === app.real) return app
      return { ...app, real: state, awayDays: away, events: [], nonce: app.nonce + 1 }
    }
    case 'hatch': {
      const real = createState(action.name.trim().slice(0, 20), todayOf(app), action.sprite)
      return { ...app, real, awayDays: 0, events: [], nonce: app.nonce + 1 }
    }
    case 'claimDaily':
    case 'buy':
    case 'useItem':
    case 'adopt':
    case 'switchPet':
    case 'unlockArea':
    case 'visitArea':
    case 'restore':
    case 'claimQuest':
      return withPet(app, (s, t) => gardenAction(s, action, t))
    case 'tick':
      return withPet(app, (s, t) => logHabit(s, action.id, t))
    case 'quiz':
      return withPet(app, (s, t) => answerQuiz(s, action.choice, t, action.correct))
    case 'dismissAway':
      return { ...app, awayDays: 0 }
    default:
      return app
  }
}

export function useApp() {
  const [app, dispatch] = useReducer(reduce, undefined, load)

  useEffect(() => {
    if (app.real) storage.set(REAL_KEY, app.real)
  }, [app.real])

  // Apply decay when the tab comes back after midnight.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && dispatch({ type: 'open' })
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(onVisible, 30000)
    return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(timer) }
  }, [])

  return [app, dispatch]
}
