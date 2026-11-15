import { Component } from 'react'

/** Keep game controls available if WebGL or a local model fails to load. */
export default class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <div className="scene-error" role="alert"><div>
      <h2>The garden needs another moment</h2>
      <p>The 3D scene couldn’t load. Reload to try again.</p>
      <button className="primary" onClick={() => window.location.reload()}>Reload garden</button>
    </div></div>
  }
}
