import FitContent from './FitContent.jsx'
import { useEffect, useRef, useState } from 'react'
import { SHOP, AREAS, PET_CATALOG, PROJECTS, dailyRewardFor } from '../game.js'
import { sfx } from '../sfx.js'
import Icon from './Icons.jsx'
import { StreakScreen, ShareSheet } from './Duo.jsx'
import GreenLens, { GreenLensCard } from './GreenLens.jsx'

const tabs = [ ['today', 'Today', 'cal'], ['shop', 'Shop', 'spark'], ['pets', 'Pets', 'heart'], ['map', 'Map', 'layers'] ]
const titles = { today: 'Today', shop: 'Shop', pets: 'Pets', map: 'Map' }
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

export default function GardenJournal({ state, today, dispatch, onCelebrate }) {
  const [tab, setTab] = useState(null)
  const [page, setPage] = useState(0)
  const [streakView, setStreakView] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [lens, setLens] = useState(false)
  const lensRef = useRef(null)
  const closeRef = useRef(null)
  const openRef = useRef(null)
  const game = state.game
  const reward = dailyRewardFor(state, today)
  useEffect(() => {
    if (!tab) return
    closeRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); sfx.close(); setTab(null); openRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab])
  const close = () => { sfx.close(); setTab(null); openRef.current?.focus() }
  const costFor = (item) => ({ coins: item.cost ?? 0, leaves: item.leaves ?? 0 })
  const prerequisite = (item) => item.requires && !game.projects.includes(item.requires) ? `First: ${PROJECTS.find(project => project.id === item.requires)?.name}` : ''
  const pageItems = (items) => items.slice(page * 2, page * 2 + 2)
  const pages = Math.ceil((tab === 'shop' ? values(SHOP).length : tab === 'pets' ? values(PET_CATALOG).length : tab === 'map' ? values(AREAS).length + values(PROJECTS).length : 0) / 2)
  return <>
    {tab && <section className="garden-journal" role="dialog" aria-modal="false" aria-labelledby="journal-title" onKeyDown={(event) => { if (event.key === 'Escape') close(); event.stopPropagation() }}>
      <header className="journal-head"><h2 id="journal-title">{titles[tab]}</h2><button ref={closeRef} className="journal-close" aria-label="Close garden journal" onClick={close}>×</button></header>
      <FitContent className="journal-body" key={`${tab}-${page}`}>
        {tab === 'today' && <>
          <div className="daily-gift"><Icon name="calr" size={28} /><div><h3>Daily gift</h3><p>{game.daily.streak > 0 ? `${game.daily.streak} day streak` : 'Start your streak'}</p></div></div>
          <div className="daily-days" aria-label="Seven day reward cycle">{Array.from({ length: 7 }, (_, index) => <span key={index} className={index < (reward.available ? reward.day - 1 : reward.day) ? 'collected' : ''}><small>Day {index + 1}</small><Icon name={index === 6 ? 'spark' : 'leaf'} size={18} /></span>)}</div>
          <button className="duo-btn green daily-claim" disabled={!reward.available} onClick={() => { sfx.claim(); dispatch({ type: 'claimDaily' }); setStreakView(true) }}>{!reward.available ? 'Come back tomorrow' : <>Claim <Price coins={reward.coins} leaves={reward.leaves} /></>}</button>
          <GreenLensCard game={game} today={today} onOpen={(event) => { sfx.open(); lensRef.current = event.currentTarget; setLens(true) }} />
        </>}
        {tab === 'shop'  && <><div className="game-list">{pageItems(values(SHOP)).map((item) => {
          const owned = game.inventory[item.id] || 0
          const decoration = item.type === 'decoration' || item.kind === 'decoration'
          const placed = game.decorations.includes(item.id)
          return <article className="shop-row" key={item.id}><span className="item-illustration" aria-hidden="true">{item.icon || (decoration ? '🌷' : '🍓')}</span><div className="item-info"><h3>{item.name}</h3><p>{item.description}</p>{owned > 0 && <button className="inventory-use" disabled={!decoration && state.health >= 100} onClick={() => { sfx.tap(); dispatch({ type: 'useItem', id: item.id }) }}>{decoration ? placed ? 'Put away' : 'Place in garden' : state.health >= 100 ? `Fully healthy · ${owned} in bag` : `Use · ${owned} in your bag`}</button>}</div><CostButton cost={decoration && owned ? 0 : costFor(item)} game={game} disabled={decoration && !!owned} onClick={() => { sfx.tap(); dispatch({ type: 'buy', id: item.id }) }}>{decoration && owned ? 'Owned' : 'Buy'}</CostButton></article>
        })}</div></>}
        {tab === 'pets' && <><div className="game-list">{pageItems(values(PET_CATALOG)).map((companion) => {
          const owned = game.pets.find((friend) => friend.id === companion.id)
          const active = game.activePet === companion.id
          return <article className={`companion-row ${active ? 'is-active' : ''}`} key={companion.id}><span className={`companion-portrait sprite-${companion.sprite || companion.id}`} aria-hidden="true">{companion.icon || symbols[companion.sprite || companion.id] || '🌱'}</span><div className="item-info"><h3>{owned?.name || companion.name}</h3><p>{companion.description}</p>{active && <small className="active-friend">With you</small>}</div>{owned ? <button className="game-small" disabled={active} onClick={() => { sfx.tap(); dispatch({ type: 'switchPet', id: companion.id }) }}>{active ? 'Active' : 'Switch'}</button> : <CostButton cost={costFor(companion)} game={game} onClick={() => { sfx.tap(); dispatch({ type: 'adopt', id: companion.id }) }}>Adopt</CostButton>}</article>
        })}</div></>}
        {tab === 'map' && <><div className="area-path">{values(AREAS).map((area, index) => {
          if (index < page * 2 || index >= page * 2 + 2) return null
          const nextLocked = values(AREAS).find(a => !game.areas.includes(a.id))
          const unlocked = game.areas.includes(area.id)
          const active = game.activeArea === area.id
          const lockedReason = prerequisite(area) || ((game.lifetimeXp ?? state.xp) < area.xp ? `${area.xp - (game.lifetimeXp ?? state.xp)} more garden XP needed` : '')
          return <article className={`area-row ${active ? 'is-active' : ''}`} key={area.id}><span className="area-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div className="item-info"><h3>{area.name}</h3><p>{area.description}</p>{!unlocked && area.id === nextLocked?.id && <small className="active-friend">Across the river</small>}</div>{unlocked ? <button className="game-small" disabled={active} onClick={() => { sfx.tap(); dispatch({ type: 'visitArea', id: area.id }) }}>{active ? 'Here' : 'Visit'}</button> : <CostButton cost={costFor(area)} game={game} disabled={!!lockedReason} reason={lockedReason} onClick={() => { sfx.tap(); dispatch({ type: 'unlockArea', id: area.id }) }}>Build footbridge</CostButton>}</article>
        })}</div>{page * 2 + 2 > values(AREAS).length && <div className="journal-section-title"><h3>Restore</h3></div>}<div className="game-list">{values(PROJECTS).map((project, index) => {
          const position = index + values(AREAS).length
          if (position < page * 2 || position >= page * 2 + 2) return null
          const complete = game.projects.includes(project.id)
          const available = !project.area || game.areas.includes(project.area)
          const lockedReason = !available ? `Unlock ${AREAS.find(area => area.id === project.area)?.name} first` : prerequisite(project)
          return <article className="restoration-row" key={project.id}><span className="restoration-symbol" aria-hidden="true"><Icon name={complete ? 'sprout' : 'leaf'} size={23} /></span><div className="item-info"><h3>{project.name}</h3><p>{project.description} <span className="restoration-reward">+{project.reward} XP</span></p></div><CostButton cost={complete ? 0 : costFor(project)} game={game} disabled={complete || !!lockedReason} reason={lockedReason} onClick={() => { sfx.tap(); dispatch({ type: 'restore', id: project.id }) }}>{complete ? 'Restored ✓' : 'Restore'}</CostButton></article>
        })}</div></>}
      </FitContent>
      {pages > 1 && <nav className="journal-pages" aria-label={`${titles[tab]} pages`}>
        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
        <span aria-live="polite">{page + 1} / {pages}</span>
        <button type="button" disabled={page + 1 === pages} onClick={() => setPage(page + 1)}>Next</button>
      </nav>}
    </section>}
    {lens && <GreenLens game={game} today={today} petName={state.pet.name} dispatch={dispatch}
      onClose={() => { sfx.close(); setLens(false); requestAnimationFrame(() => lensRef.current?.focus()) }}
      onCelebrate={(cheer) => { close(); onCelebrate?.(cheer) }} />}
    {streakView && <StreakScreen streak={game.daily.streak} onShare={() => setSharing(true)} onContinue={() => { sfx.tap(); setStreakView(false) }} />}
    {sharing && <ShareSheet title="Garden streak" headline={`${game.daily.streak} day streak with ${state.pet.name}!`}
      stats={[[game.daily.streak, 'day streak'], [state.xp, 'total XP'], [game.daily.total, 'gifts collected'], [game.leaves, game.leaves === 1 ? 'leaf' : 'leaves']]}
      text={`I'm on a ${game.daily.streak} day streak growing ${state.pet.name} in Sustain-a-Pet! 🌱`} onClose={() => setSharing(false)} />}
    <nav className="garden-dock" aria-label="Garden activities">{tabs.map(([id, label, icon]) => <button key={id} className={tab === id ? 'selected' : ''} aria-expanded={tab === id} onClick={(event) => { openRef.current = event.currentTarget; setPage(0); if (tab === id) { sfx.close(); setTab(null) } else { sfx.open(); setTab(id) } }}><Icon name={icon} size={21} /><span>{label}</span>{id === 'today' && reward.available && <i className="gift-ready" aria-label="Daily gift ready" />}</button>)}</nav>
  </>
}
