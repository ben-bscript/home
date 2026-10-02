import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import Dashboard from './routes/Dashboard.jsx'
import Device from './routes/Device.jsx'
import Root from './routes/Root.jsx'
import Settings from './routes/Settings.jsx'
import './styles.css'

const router = createBrowserRouter([
  {
    path: '/',
    Component: Root,
    children: [
      { index: true, Component: Dashboard },
      { path: 'devices/:id', Component: Device },
      { path: 'settings', Component: Settings },
    ],
  },
])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
