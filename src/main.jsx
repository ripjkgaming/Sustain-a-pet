import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/nunito/latin-600.css'
import '@fontsource/nunito/latin-700.css'
import '@fontsource/nunito/latin-800.css'
import '@fontsource/nunito/latin-900.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <div className="device">
      <div className="notch" aria-hidden="true" />
      <div className="screen"><App /></div>
    </div>
  </StrictMode>,
)


import './motion.css'
import './duo.css'
