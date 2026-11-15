import { useEffect, useRef, useState } from 'react'
import { SHOP, AREAS, PET_CATALOG, PROJECTS, dailyRewardFor, questProgress } from '../game.js'
import Icon from './Icons.jsx'
import habits from '../data/habits.json'
import { StreakScreen, ShareSheet } from './Duo.jsx'
import QuizCard from './QuizCard.jsx'

const tabs = [ ['today', 'Today', 'cal'], ['shop', 'Shop', 'spark'], ['pets', 'Friends', 'heart'], ['map', 'Explore', 'layers'] ]
const symbols = { leafling: '🌱', mossball: '🌿', bloom: '🌸', meadow: '🌼', woodland: '🌲', pond: '💧' }
const values = (catalog) => Array.isArray(catalog) ? catalog : Object.values(catalog)
function Price({ coins = 0, leaves = 0 }) {
  return <span className="game-price">{coins > 0 && <span><i aria-hidden="true">◉</i> {coins}</span>}{leaves > 0 && <span><Icon name="leaf" size={12} /> {leaves}</span>}</span>
}
function CostButton({ cost, game, children, disabled, reason, ...props }) {
  const price = typeof cost === 'number' ? { coins: cost } : cost || {}
  const missing = game.coins < (price.coins || 0) ? `${(price.coins || 0) - game.coins} more coins needed` : game.leaves < (price.leaves || 0) ? `${(price.leaves || 0) - game.leaves} more leaves needed` : ''
  return <div className="game-purchase"><button {...props} disabled={disabled || !!missing}>{children}<Price {...price} /></button>{(reason || missing) && <small>{reason || missing}</small>}</div>
}

export default function GardenJournal({ state, today, dispatch }) {
  const [tab, setTab] = useState(null)
  const [streakView, setStreakView] = useState(false)
  const [sharing, setSharing] = useState(false)
  const closeRef = useRef(null)
  const openRef = useRef(null)
  const game = state.game
  const reward = dailyRewardFor(state, today)
  const quests = questProgress(state, today)
  useEffect(() => {
    if (!tab) return
    closeRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); setTab(null); openRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab])
  const close = () => { setTab(null); openRef.current?.focus() }
  const costFor = (item) => ({ coins: item.cost ?? 0, leaves: item.leaves ?? 0 })
  const prerequisite = (item) => item.requires && !game.projects.includes(item.requires) ? `First: ${PROJECTS.find(project => project.id === item.requires)?.name}` : ''
  return <>
    <div className="game-wallet" aria-label={`${game.coins} coins and ${game.leaves} leaves`}><span><b aria-hidden="true">◉</b> {game.coins}<small>coins</small></span><span><Icon name="leaf" size={15} /> {game.leaves}<small>{game.leaves === 1 ? 'leaf' : 'leaves'}</small></span></div>
    {tab && <section className="garden-journal" role="dialog" aria-modal="false" aria-labelledby="journal-title" onKeyDown={(event) => { if (event.key === 'Escape') close(); event.stopPropagation() }}>
      <header className="journal-head"><div><span className="journal-kicker">YOUR GARDEN JOURNAL</span><h2 id="journal-title">{tab === 'today' ? 'A little care, every day' : tab === 'shop' ? 'The garden shop' : tab === 'pets' ? 'A growing family' : 'Beyond the meadow'}</h2></div><button ref={closeRef} className="journal-close" aria-label="Close garden journal" onClick={close}>×</button></header>
      <div className="journal-body" key={tab}>
        {tab === 'today' && <>
          <div className="daily-gift"><Icon name="calr" size={28} /><div><h3>Your daily gift</h3><p>{game.daily.streak > 0 ? `${game.daily.streak} day streak. Keep growing together.` : 'A fresh start for your little world.'}</p></div></div>
          <div className="daily-days" aria-label="Seven day reward cycle">{Array.from({ length: 7 }, (_, index) => <span key={index} className={index < (reward.available ? reward.day - 1 : reward.day) ? 'collected' : ''}><small>Day {index + 1}</small><Icon name={index === 6 ? 'spark' : 'leaf'} size={18} /></span>)}</div>
          <button className="game-primary daily-claim" disabled={!reward.available} onClick={() => { dispatch({ type: 'claimDaily' }); setStreakView(true) }}>{!reward.available ? 'Gift collected · come back tomorrow' : <>Collect today’s gift <Price coins={reward.coins} leaves={reward.leaves} /></>}</button>
          <div className="journal-section-title"><h3>Today’s little adventures</h3><small>Habits earn coins and leaves. Quests give a little extra.</small></div>
          <div className="game-list">{values(quests).map((quest) => <article className="quest-row" key={quest.id}><div><strong>{quest.name || quest.title}</strong><p>{quest.description}</p><div className="quest-track"><span style={{ transform: `scaleX(${Math.min(1, quest.progress / quest.target)})` }} /></div><small>{Math.min(quest.progress, quest.target)} / {quest.target} · <Price coins={quest.coins ?? quest.reward?.coins} leaves={quest.leaves ?? quest.reward?.leaves} /></small></div><button className="game-small" disabled={quest.claimed || !quest.complete} onClick={() => dispatch({ type: 'claimQuest', id: quest.id })}>{quest.claimed ? 'Collected' : quest.complete ? 'Collect' : 'Growing'}</button></article>)}</div>
          <details className="journal-habits">
            <summary>Your daily habits <span>{quests[1].progress} / 8</span></summary>
            <p className="journal-intro">Check off what you did in real life. Your active friend receives the care and XP.</p>
            {habits.filter(habit => habit.id !== 'quiz').map(habit => {
              const complete = state.days[today]?.habits.includes(habit.id)
              return <label className={`journal-habit ${complete ? 'complete' : ''}`} key={habit.id}>
                <input type="checkbox" checked={!!complete} disabled={complete} onChange={() => dispatch({ type: 'tick', id: habit.id })} />
                <span>{habit.label}<small>+{habit.xp} XP · +{habit.xp + 5} coins · +1 leaf</small></span>
              </label>
            })}
            <QuizCard today={today} result={state.days[today]?.quiz} onAnswer={(choice, correct) => dispatch({ type: 'quiz', choice, correct })} />
          </details>
        </>}
        {tab === 'shop'  && <><p className="journal-intro">Small comforts for your companion. Garden decorations stay with you in every place you explore.</p><div className="game-list">{values(SHOP).map((item) => {
          const owned = game.inventory[item.id] || 0
          const decoration = item.type === 'decoration' || item.kind === 'decoration'
          const placed = game.decorations.includes(item.id)
          return <article className="shop-row" key={item.id}><span className="item-illustration" aria-hidden="true">{item.icon || (decoration ? '🌷' : '🍓')}</span><div className="item-info"><h3>{item.name}</h3><p>{item.description}</p>{owned > 0 && <button className="inventory-use" disabled={!decoration && state.health >= 100} onClick={() => dispatch({ type: 'useItem', id: item.id })}>{decoration ? placed ? 'Put away' : 'Place in garden' : state.health >= 100 ? `Fully healthy · ${owned} in bag` : `Use · ${owned} in your bag`}</button>}</div><CostButton cost={decoration && owned ? 0 : costFor(item)} game={game} disabled={decoration && !!owned} onClick={() => dispatch({ type: 'buy', id: item.id })}>{decoration && owned ? 'Owned' : 'Buy'}</CostButton></article>
        })}</div></>}
        {tab === 'pets' && <><p className="journal-intro">Different little spirits, one shared garden. Each friend grows at its own pace. Today’s habits count once for the whole garden.</p><div className="game-list">{values(PET_CATALOG).map((companion) => {
          const owned = game.pets.find((friend) => friend.id === companion.id)
          const active = game.activePet === companion.id
          return <article className={`companion-row ${active ? 'is-active' : ''}`} key={companion.id}><span className={`companion-portrait sprite-${companion.sprite || companion.id}`} aria-hidden="true">{companion.icon || symbols[companion.sprite || companion.id] || '🌱'}</span><div className="item-info"><h3>{owned?.name || companion.name}</h3><p>{companion.description}</p>{active && <small className="active-friend">Exploring with you</small>}</div>{owned ? <button className="game-small" disabled={active} onClick={() => dispatch({ type: 'switchPet', id: companion.id })}>{active ? 'Together' : 'Explore'}</button> : <CostButton cost={costFor(companion)} game={game} onClick={() => dispatch({ type: 'adopt', id: companion.id })}>Adopt</CostButton>}</article>
        })}</div></>}
        {tab === 'map' && <><p className="journal-intro">Follow the path, open new places, and leave each corner a little greener.</p><div className="area-path">{values(AREAS).map((area, index) => {
          const unlocked = game.areas.includes(area.id)
          const active = game.activeArea === area.id
          const lockedReason = prerequisite(area) || ((game.lifetimeXp ?? state.xp) < area.xp ? `${area.xp - (game.lifetimeXp ?? state.xp)} more garden XP needed` : '')
          return <article className={`area-row ${active ? 'is-active' : ''}`} key={area.id}><span className="area-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div className="item-info"><h3>{area.name}</h3><p>{area.description}</p></div>{unlocked ? <button className="game-small" disabled={active} onClick={() => dispatch({ type: 'visitArea', id: area.id })}>{active ? 'You are here' : 'Visit'}</button> : <CostButton cost={costFor(area)} game={game} disabled={!!lockedReason} reason={lockedReason} onClick={() => dispatch({ type: 'unlockArea', id: area.id })}>Unlock</CostButton>}</article>
        })}</div><div className="journal-section-title"><h3>Bring the garden back to life</h3><small>Restoration stays in your world.</small></div><div className="game-list">{values(PROJECTS).map((project) => {
          const complete = game.projects.includes(project.id)
          const available = !project.area || game.areas.includes(project.area)
          const lockedReason = !available ? `Unlock ${AREAS.find(area => area.id === project.area)?.name} first` : prerequisite(project)
          return <article className="restoration-row" key={project.id}><span className="restoration-symbol" aria-hidden="true"><Icon name={complete ? 'sprout' : 'leaf'} size={23} /></span><div className="item-info"><h3>{project.name}</h3><p>{project.description} <span className="restoration-reward">+{project.reward} XP</span></p></div><CostButton cost={complete ? 0 : costFor(project)} game={game} disabled={complete || !!lockedReason} reason={lockedReason} onClick={() => dispatch({ type: 'restore', id: project.id })}>{complete ? 'Restored ✓' : 'Restore'}</CostButton></article>
        })}</div></>}
      </div>
    </section>}
    {streakView && <StreakScreen streak={game.daily.streak} onShare={() => setSharing(true)} onContinue={() => setStreakView(false)} />}
    {sharing && <ShareSheet title="Garden streak" headline={`${game.daily.streak} day streak with ${state.pet.name}!`}
      stats={[[game.daily.streak, 'day streak'], [state.xp, 'total XP'], [game.daily.total, 'gifts collected'], [game.leaves, game.leaves === 1 ? 'leaf' : 'leaves']]}
      text={`I'm on a ${game.daily.streak} day streak growing ${state.pet.name} in Sustain-a-Pet! 🌱`} onClose={() => setSharing(false)} />}
    <nav className="garden-dock" aria-label="Garden activities">{tabs.map(([id, label, icon]) => <button key={id} className={tab === id ? 'selected' : ''} aria-expanded={tab === id} onClick={(event) => { openRef.current = event.currentTarget; setTab(tab === id ? null : id) }}><Icon name={icon} size={21} /><span>{label}</span>{id === 'today' && reward.available && <i className="gift-ready" aria-label="Daily gift ready" />}</button>)}</nav>
  </>
}
