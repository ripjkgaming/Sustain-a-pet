import { Component } from 'react'
import { hasWebGL } from '../resilience.js'

/**
 * Keep game controls available if WebGL is missing or a local model fails to load.
 * Without WebGL the 3D children are never mounted (so no context errors); `fallback` is shown instead.
 */
export default class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    const { children, fallback } = this.props
    if (!hasWebGL()) return fallback ?? <SceneFallback />
    if (!this.state.failed) return children
    return <SceneFallback reload />
  }
}

/** Static scene notice. With `reload`, offers a reload because the failure may be temporary. */
export function SceneFallback({ reload = false, title, children }) {
  return <div className="scene-error" role={reload ? 'alert' : 'status'}><div>
    {children}
    <h2>{title || (reload ? 'The garden needs another moment' : 'Showing a simple garden')}</h2>
    <p>{reload ? 'The 3D scene couldn’t load. Reload to try again.' : 'This device can’t show the 3D garden. Use Quests to tick habits and take the daily quiz.'}</p>
    {reload && <button className="primary" onClick={() => window.location.reload()}>Reload garden</button>}
  </div></div>
}
