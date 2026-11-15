import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/nunito/latin-600.css'
import '@fontsource/nunito/latin-700.css'
import '@fontsource/nunito/latin-800.css'
import '@fontsource/nunito/latin-900.css'
import './index.css'
import App from './App.jsx'
import { registerServiceWorker, UpdateNotice } from './pwa.jsx'

const sw = registerServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <div className="device">
      <div className="notch" aria-hidden="true" />
      <div className="screen"><App /><UpdateNotice sw={sw} /></div>
    </div>
  </StrictMode>,
)


import './motion.css'
import './duo.css'
import './quest.css'
import './home.css'
import './screens.css'

import './viewport.css'
